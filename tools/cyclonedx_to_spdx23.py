import argparse
import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "KNIME" / "KNIMEBusinessHub_added copyrights, licensetext.json"
DEFAULT_OUTPUT = ROOT / "KNIME" / "KNIMEBusinessHub_added copyrights SPDX 2.3.json"
CHECKSUM_ALGORITHMS = {
    "MD5": "MD5",
    "SHA-1": "SHA1",
    "SHA-224": "SHA224",
    "SHA-256": "SHA256",
    "SHA-384": "SHA384",
    "SHA-512": "SHA512",
    "SHA3-256": "SHA3-256",
    "SHA3-384": "SHA3-384",
    "SHA3-512": "SHA3-512",
}
TOKEN_PATTERN = re.compile(r"LicenseRef-[A-Za-z0-9.-]+|[A-Za-z0-9.-]+|[()]\s*|\s+")
IDENTIFIER_PATTERN = re.compile(r"^(?:[A-Za-z0-9.-]+|LicenseRef-[A-Za-z0-9.-]+)$")
URL_LIST_PATTERN = re.compile(r"^https?://\S+(?:\s*,\s*https?://\S+)*$")


class ExpressionParser:
    def __init__(self, expression, known_license_refs):
        self.tokens = [token.strip() for token in TOKEN_PATTERN.findall(expression) if token.strip()]
        if "".join(self.tokens).replace(" ", "") != re.sub(r"\s+", "", expression):
            raise ValueError("unsupported token")
        self.index = 0
        self.known_license_refs = known_license_refs

    def parse(self):
        result = self.parse_or()
        if self.index != len(self.tokens):
            raise ValueError("unexpected token")
        return result

    def parse_or(self):
        values = [self.parse_and()]
        while self.take("OR"):
            values.append(self.parse_and())
        return " OR ".join(values)

    def parse_and(self):
        values = [self.parse_with()]
        while self.take("AND"):
            values.append(self.parse_with())
        return " AND ".join(values)

    def parse_with(self):
        value = self.parse_primary()
        if self.take("WITH"):
            exception = self.parse_primary()
            if "(" in exception or " OR " in exception or " AND " in exception:
                raise ValueError("invalid WITH exception")
            value += " WITH " + exception
        return value

    def parse_primary(self):
        if self.take("("):
            value = self.parse_or()
            if not self.take(")"):
                raise ValueError("missing closing parenthesis")
            return "(" + value + ")"
        if self.index >= len(self.tokens):
            raise ValueError("missing license identifier")
        identifier = self.tokens[self.index]
        if identifier in {"AND", "OR", "WITH", "(" , ")"} or not IDENTIFIER_PATTERN.fullmatch(identifier):
            raise ValueError("invalid license identifier")
        self.index += 1
        if identifier.startswith("LicenseRef-") and identifier not in self.known_license_refs:
            raise ValueError("undefined LicenseRef")
        return identifier

    def take(self, token):
        if self.index < len(self.tokens) and self.tokens[self.index] == token:
            self.index += 1
            return True
        return False


def safe_license_expression(expression, known_license_refs):
    try:
        return ExpressionParser(expression, known_license_refs).parse()
    except ValueError:
        return None


def license_payload(entry):
    if not isinstance(entry, dict):
        return {}
    license_data = entry.get("license")
    return license_data if isinstance(license_data, dict) else entry


def component_license_values(component):
    values = []
    for entry in component.get("licenses", []) or []:
        license_data = license_payload(entry)
        text = license_data.get("text")
        text = text.get("content") if isinstance(text, dict) else text
        label = license_data.get("id") or license_data.get("name")
        expression = license_data.get("id") or license_data.get("expression") or label
        if isinstance(text, str) and text:
            digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
            values.append((expression or "", text, label, license_data.get("url"), "LicenseRef-" + digest))
        elif isinstance(expression, str) and expression.strip():
            values.append((expression.strip(), None, label, license_data.get("url"), None))
        elif isinstance(label, str) and label.strip():
            values.append((label.strip(), None, label.strip(), license_data.get("url"), None))
    return values


def purpose_for(component_type):
    return {
        "application": "APPLICATION",
        "framework": "FRAMEWORK",
        "library": "LIBRARY",
        "container": "CONTAINER",
        "operating-system": "OPERATING-SYSTEM",
        "device": "DEVICE",
        "firmware": "FIRMWARE",
        "file": "FILE",
    }.get(str(component_type or "").lower())


def package_checksums(component):
    checksums = []
    for checksum in component.get("hashes", []) or []:
        algorithm = CHECKSUM_ALGORITHMS.get(str(checksum.get("alg", "")).upper())
        value = checksum.get("content")
        if algorithm and isinstance(value, str):
            checksums.append({"algorithm": algorithm, "checksumValue": value.lower()})
    return checksums


def convert(source_path, output_path):
    source_bytes = source_path.read_bytes()
    source_digest = hashlib.sha256(source_bytes).hexdigest()
    bom = json.loads(source_bytes)
    components = bom.get("components", [])
    license_values = [component_license_values(component) for component in components]

    text_refs = {
        text_ref
        for values in license_values
        for _, text, _, _, text_ref in values
        if text and text_ref
    }
    aliases = {}
    for values in license_values:
        for expression, text, label, _, _ in values:
            if text and label:
                parsed = safe_license_expression(expression, text_refs)
                if parsed:
                    aliases.setdefault(label, set()).add(parsed)
    unique_aliases = {
        label: next(iter(refs))
        for label, refs in aliases.items()
        if len(refs) == 1
    }
    text_by_ref = {}
    labels_by_ref = {}
    urls_by_ref = {}
    for values in license_values:
        for _, text, label, url, text_ref in values:
            if text:
                text_by_ref[text_ref] = text
                labels_by_ref.setdefault(text_ref, set()).update(
                    value for value in [label] if value
                )
                if url:
                    urls_by_ref.setdefault(text_ref, set()).add(url)

    known_refs = set(text_by_ref)
    packages = []
    relationships = []
    component_ids = {}

    app = bom.get("metadata", {}).get("component", {})
    app_id = "SPDXRef-DocumentRoot"
    app_name = app.get("name") or "SBOM Root"
    app_package = {
        "SPDXID": app_id,
        "name": app_name,
        "downloadLocation": "NOASSERTION",
        "filesAnalyzed": False,
        "copyrightText": "NOASSERTION",
    }
    if app.get("version"):
        app_package["versionInfo"] = app["version"]
    app_purpose = purpose_for(app.get("type")) or "APPLICATION"
    app_package["primaryPackagePurpose"] = app_purpose
    packages.append(app_package)
    relationships.append({
        "spdxElementId": "SPDXRef-DOCUMENT",
        "relationshipType": "DESCRIBES",
        "relatedSpdxElement": app_id,
    })

    for index, component in enumerate(components, start=1):
        package_id = f"SPDXRef-Component-{index}"
        bom_ref = component.get("bom-ref")
        if bom_ref:
            component_ids[bom_ref] = package_id
        package = {
            "SPDXID": package_id,
            "name": component.get("name") or f"Component {index}",
            "downloadLocation": "NOASSERTION",
            "filesAnalyzed": False,
            "copyrightText": component.get("copyright") or "NOASSERTION",
        }
        if component.get("version"):
            package["versionInfo"] = component["version"]
        if component.get("description"):
            package["summary"] = component["description"]
        if component.get("group"):
            package["sourceInfo"] = "CycloneDX group: " + component["group"]
        package_purpose = purpose_for(component.get("type"))
        if package_purpose:
            package["primaryPackagePurpose"] = package_purpose
        checksums = package_checksums(component)
        if checksums:
            package["checksums"] = checksums

        external_refs = []
        purl = component.get("purl")
        if purl:
            external_refs.append({
                "referenceCategory": "PACKAGE-MANAGER",
                "referenceType": "purl",
                "referenceLocator": purl,
            })
        for reference in component.get("externalReferences", []) or []:
            url = reference.get("url")
            if not url:
                continue
            ref_type = str(reference.get("type", "other"))
            if ref_type == "website" and not package.get("homepage"):
                package["homepage"] = url
            external_refs.append({
                "referenceCategory": "OTHER",
                "referenceType": "other",
                "referenceLocator": url,
                "comment": "CycloneDX external reference type: " + ref_type,
            })
        if external_refs:
            package["externalRefs"] = external_refs

        expressions = []
        unresolved = []
        license_reference_urls = []
        package_text_refs = []
        license_notes = []
        for expression, text, label, _, text_ref in license_values[index - 1]:
            if not text and label and URL_LIST_PATTERN.fullmatch(label):
                license_reference_urls.extend(url.strip() for url in label.split(","))
                continue
            candidate = expression
            if not text and candidate in unique_aliases:
                candidate = unique_aliases[candidate]
            parsed = safe_license_expression(candidate, known_refs)
            if not parsed and text and text_ref:
                parsed = safe_license_expression(text_ref, known_refs)
            if parsed:
                if parsed not in expressions:
                    expressions.append(parsed)
            else:
                unresolved.append(label or expression)
            if text and text_ref and text_ref not in package_text_refs:
                package_text_refs.append(text_ref)

        if license_reference_urls:
            for url in sorted(set(license_reference_urls)):
                external_refs.append({
                    "referenceCategory": "OTHER",
                    "referenceType": "other",
                    "referenceLocator": url,
                    "comment": "CycloneDX license reference URL",
                })
            package["externalRefs"] = external_refs
            license_notes.append("CycloneDX license reference URLs: " + ", ".join(sorted(set(license_reference_urls))))

        if expressions:
            package["licenseDeclared"] = " OR ".join(
                value if " AND " not in value else "(" + value + ")"
                for value in expressions
            )
            if unresolved:
                license_notes.append(
                    "SPDX expression contains the resolvable CycloneDX license values; "
                    "unresolved source labels: " + ", ".join(sorted(set(unresolved)))
                )
            if len(expressions) > 1:
                license_notes.append(
                    "CycloneDX provided multiple license choices without explicit operators; "
                    "they are represented as SPDX OR alternatives."
                )
        else:
            package["licenseDeclared"] = "NOASSERTION"
            if unresolved:
                license_notes.append("License labels not expressible as SPDX terms without inventing text: "
                                     + ", ".join(sorted(set(unresolved))))
        if package_text_refs:
            license_notes.append("Embedded license text preserved once as " + ", ".join(package_text_refs))
        if license_notes:
            package["licenseComments"] = "; ".join(license_notes)
        packages.append(package)

    for dependency in bom.get("dependencies", []) or []:
        source_id = component_ids.get(dependency.get("ref"))
        if not source_id:
            continue
        for target in dependency.get("dependsOn", []) or []:
            target_id = component_ids.get(target)
            if target_id:
                relationships.append({
                    "spdxElementId": source_id,
                    "relationshipType": "DEPENDS_ON",
                    "relatedSpdxElement": target_id,
                })

    extracted_infos = []
    for license_ref, text in sorted(text_by_ref.items()):
        info = {"licenseId": license_ref, "extractedText": text}
        labels = sorted(labels_by_ref.get(license_ref, set()))
        if labels:
            info["name"] = labels[0]
            if len(labels) > 1:
                info["comment"] = "CycloneDX labels: " + "; ".join(labels)
        urls = sorted(urls_by_ref.get(license_ref, set()))
        if urls:
            info["seeAlsos"] = urls
        extracted_infos.append(info)

    created = bom.get("metadata", {}).get("timestamp", "2026-01-01T00:00:00Z")
    if len(created) == 16 and created[10] == " ":
        created = created.replace(" ", "T") + ":00Z"
    elif len(created) == 19 and created[10] == " ":
        created = created.replace(" ", "T") + "Z"
    root_label = re.sub(r"[^A-Za-z0-9.-]+", "-", app_name.lower()).strip("-")
    document = {
        "spdxVersion": "SPDX-2.3",
        "dataLicense": "CC0-1.0",
        "SPDXID": "SPDXRef-DOCUMENT",
        "name": app_name + (" " + app["version"] if app.get("version") else ""),
        "documentNamespace": (
            f"https://spdx.org/spdxdocs/{root_label}-{source_digest[:24]}"
        ),
        "creationInfo": {
            "created": created,
            "creators": ["Tool: SBOM Validator CycloneDX to SPDX 2.3 converter"],
        },
        "packages": packages,
        "relationships": relationships,
        "hasExtractedLicensingInfos": extracted_infos,
    }
    output_path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return len(components), len(extracted_infos), len(relationships)


def main():
    parser = argparse.ArgumentParser(
        description="Convert a CycloneDX JSON BOM to SPDX 2.3 with deduplicated license text."
    )
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    component_count, license_count, relationship_count = convert(args.input, args.output)
    print(f"Wrote {args.output}")
    print(f"Components: {component_count}; unique license texts: {license_count}; relationships: {relationship_count}")


if __name__ == "__main__":
    main()