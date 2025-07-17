import pandas as pd
from pymongo import MongoClient

df = pd.read_csv("name_list.csv")

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
        "verificationNumber": int(row["Verification number"]),
        "discordTag": str(row["Discordtag"]).strip(),
        "discordId": discord_id,
        "firstName": str(row["First name"]).strip(),
        "lastName": str(row["Last name"]).strip(),
        "comment": str(row["Comment"]).strip() if not pd.isna(row["Comment"]) else ""
    }

    collection.insert_one(doc)
    inserted += 1

print(f"✅ Successfully inserted: {inserted}")
print(f"⚠️ Skipped (already exists): {skipped}")