import pandas as pd
from pymongo import MongoClient

df = pd.read_csv("namenslisten htl server leer.csv")

client = MongoClient("mongodb://localhost:27017/")
db = client["schooldb"]
collection = db["verifiedusers"]

inserted, skipped = 0, 0

for _, row in df.iterrows():
    discord_id = str(row["Discord ID"]).strip()

    if collection.find_one({"discordId": discord_id}):
        skipped += 1
        continue

    doc = {
        "verificationNumber": int(row["Verifizierungsnummer"]),
        "discordTag": str(row["Discordtag"]).strip(),
        "discordId": discord_id,
        "firstName": str(row["Vorname"]).strip(),
        "lastName": str(row["Nachname"]).strip(),
        "comment": str(row["Kommentar"]).strip() if not pd.isna(row["Kommentar"]) else ""
    }

    collection.insert_one(doc)
    inserted += 1

print(f"✅ Erfolgreich eingetragen: {inserted}")
print(f"⚠️ Übersprungen (bereits vorhanden): {skipped}")

# for entry in collection.find({}, {"_id": 0}):
#     print(entry)
