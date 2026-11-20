
import csv
import json
import zipfile
from datetime import datetime
from pathlib import Path

CSV_FILE = "OSSCA_Licenses.csv"
ZIP_FILE = "ExportOsscaLicenses_2026-07-22_1247.zip"
OUTPUT_FILE = "reference.json"
MISSING_FILE = "missing_license_texts.txt"

SELECTED_INDEXES = [0, 1, 2, 23]  # A, B, C, X oszlopok


def detect_delimiter(file_path):
    with open(file_path, "r", encoding="utf-8-sig", newline="") as f:
        sample = f.read(8192)

    delimiters = [";", ",", "\t"]

    best_delimiter = ";"
    best_count = 0

    first_line = sample.splitlines()[0] if sample.splitlines() else ""

    for delimiter in delimiters:
        count = len(first_line.split(delimiter))
        if count > best_count:
            best_count = count
            best_delimiter = delimiter

    return best_delimiter


def read_zip_texts(zip_file):
    texts = {}

    with zipfile.ZipFile(zip_file, "r") as zip_ref:
        for name in zip_ref.namelist():
            if not name.lower().endswith(".txt"):
                continue

            file_name = Path(name).name
            base_name = file_name[:-4]  # .txt eltávolítása
            key = base_name.strip().lower()

            with zip_ref.open(name) as txt_file:
                content = txt_file.read().decode("utf-8", errors="replace")

            texts[key] = {
                "zipPath": name,
                "content": content
            }

    return texts


def main():
    delimiter = detect_delimiter(CSV_FILE)

    print(f"Felismert CSV elválasztó: {repr(delimiter)}")

    zip_texts = read_zip_texts(ZIP_FILE)

    print(f"TXT fájlok száma a ZIP-ben: {len(zip_texts)}")

    records = []
    missing_license_texts = []

    with open(CSV_FILE, "r", encoding="utf-8-sig", newline="") as csvfile:
        reader = csv.reader(csvfile, delimiter=delimiter)
        rows = list(reader)

    if len(rows) < 2:
        raise Exception("A CSV nem tartalmaz adatokat, vagy csak fejléc van benne.")

    headers = rows[0]

    print(f"Felismert oszlopok száma a CSV fejlécében: {len(headers)}")
    print("Első néhány fejléc:")
    for i, header in enumerate(headers[:30], start=1):
        print(f"{i}: {header}")

    max_required_index = max(SELECTED_INDEXES)

    if len(headers) <= max_required_index:
        raise Exception(
            "A CSV fejlécében nincs elég oszlop az X oszlophoz. "
            f"Elvárt minimum oszlopszám: {max_required_index + 1}, "
            f"talált oszlopszám: {len(headers)}. "
            "Valószínűleg rossz az elválasztó, vagy az exportált CSV nem tartalmazza az X oszlopot."
        )

    selected_headers = [headers[i] for i in SELECTED_INDEXES]

    for line_number, row in enumerate(rows[1:], start=2):
        if not row or all(cell.strip() == "" for cell in row):
            continue

        if len(row) <= max_required_index:
            print(
                f"Figyelem: a(z) {line_number}. sor túl rövid, kihagyva. "
                f"Oszlopok száma: {len(row)}"
            )
            continue

        identifier = row[0].strip()

        if not identifier:
            print(f"Figyelem: a(z) {line_number}. sorban üres az A oszlop, kihagyva.")
            continue

        record = {}

        for idx, header in zip(SELECTED_INDEXES, selected_headers):
            record[header] = row[idx].strip()

        lookup_key = identifier.lower()
        license_entry = zip_texts.get(lookup_key)

        if license_entry:
            license_text = license_entry["content"]
            source_file = license_entry["zipPath"]
        else:
            license_text = ""
            source_file = ""
            missing_license_texts.append(identifier)

        record["LicenseText"] = license_text
        record["LicenseTextSourceFile"] = source_file

        records.append(record)

    output = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "sourceCsv": CSV_FILE,
        "sourceZip": ZIP_FILE,
        "recordCount": len(records),
        "missingLicenseTextCount": len(missing_license_texts),
        "records": records
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    with open(MISSING_FILE, "w", encoding="utf-8") as f:
        for item in missing_license_texts:
            f.write(item + "\n")

    print("")
    print("Kész.")
    print(f"JSON létrehozva: {OUTPUT_FILE}")
    print(f"Rekordok száma: {len(records)}")
    print(f"Hiányzó licenc TXT-k száma: {len(missing_license_texts)}")
    print(f"Hiányzó TXT lista: {MISSING_FILE}")


if __name__ == "__main__":
    main()
