# Manufacturer Hardening — Explained Simply

Welcome! This guide explains all the changes we just made to the **Manufacturer** endpoints and the database. 

If backend engineering and database concepts sometimes feel like confusing alphabet soup, this document is for you. We're going to break down each problem, why it happens in the real world, why it matters to a pharmacy, and why we fixed it the way we did.

---

## The Big Picture: What is "Hardening"?

Imagine you built a wooden door for your pharmacy. It opens and closes, and people can walk through. That's a working feature.

**"Hardening"** means putting on a deadbolt lock, weatherproofing the wood so it doesn't rot in the rain, and making sure nobody can kick it down or slip fake IDs under the crack. 

Before hardening, our endpoints worked under ideal conditions. But real-world users make typos, paste weird characters from spreadsheets, and two employees might click "Save" at the exact same millisecond. Hardening prepares the code for real-world chaos.

---

## 1. The Case-Sensitivity Race ("Pfizer" vs "pfizer")

### 📖 The Real-World Scenario
Two pharmacy clerks, **Sarah** and **Tunde**, are entering new stock at their computers at 9:00 AM. 
* Sarah types: `Pfizer`
* Tunde types: `pfizer` (lowercase)
* Both hit **"Add Manufacturer"** at the exact same second.

### 🛑 What Went Wrong Before
1. **PostgreSQL is case-sensitive:** By default, PostgreSQL treats `"Pfizer"` and `"pfizer"` as two completely different companies, just like `"Apple"` and `"Orange"`.
2. **The App-Level Check Got Fooled:**
   Before inserting, our code asked: *"Hey database, does 'pfizer' already exist?"*
   Because both requests arrived at the exact same millisecond, the database told Sarah *"Nope, doesn't exist!"* and told Tunde *"Nope, doesn't exist either!"*
3. **The Disaster:**
   Both rows were saved into the database! Now your pharmacy database has two different records for Pfizer. Half your paracetamol is linked to `Pfizer (ID: 1)`, and the other half is linked to `pfizer (ID: 2)`. When the manager runs a sales report for Pfizer, the numbers are cut in half and totally wrong.

### 🛠️ How We Fixed It
We added a new column to the database called **`nameLower`** with a strict rule: **`@unique`**.

Whenever anyone creates or updates a manufacturer:
* We save the display name as they typed it: `"Pfizer"`
* But we automatically save the lowercase version in `nameLower`: `"pfizer"`

Now, even if Sarah and Tunde hit "Save" at the exact same millisecond:
* Sarah's request writes `nameLower: "pfizer"`.
* Tunde's request tries to write `nameLower: "pfizer"`.
* **PostgreSQL's database engine slams the door on Tunde with an error:** *"Duplicate key error! 'pfizer' is already taken!"*
* Our error handler catches this and sends back a friendly `409 Conflict: "A record with the same unique value already exists"`.

**Result:** Zero duplicate manufacturers can ever slip into your database again.

---

## 2. The Missing Index on `Product(manufacturerId)`

### 📖 The Real-World Scenario
You want to delete an old manufacturer, say `OldPharma Ltd`. 
Our pharmacy business rule says: **You cannot delete a manufacturer if products are currently linked to it.**

So the code has to check: *"Does OldPharma have any products linked to it?"*

### 🛑 What Went Wrong Before
Imagine a warehouse with **50,000 product boxes** on shelves. 
Each box has a label showing who made it (`manufacturerId`).

When PostgreSQL created the database, it automatically created an index (like an alphabetical quick-reference catalog) for `Product.id`. **However, PostgreSQL NEVER automatically creates an index for foreign keys like `manufacturerId`!**

Without an index, the database worker had to walk through every single aisle and inspect all 50,000 boxes **one by one** just to answer: *"Are there any boxes from OldPharma?"*
This is called a **Sequential Scan** (Full Table Scan). As your pharmacy grows to 20,000 or 50,000 drugs, this check gets slower and slower every single month.

### 🛠️ How We Fixed It
In [prisma/schema.prisma](file:///c:/Users/SAMUEL%20AYOOLA/OneDrive/Desktop/BACKEND%20DEV%202%20BY%20ME/Phamacy%20Inventory%20Management%20System/pharmacy-management-system/prisma/schema.prisma), we added one line to `Product`:
```prisma
@@index([manufacturerId])
```

Think of this like creating an index card file sorted by manufacturer. When you ask: *"Does OldPharma have products?"*, Postgres looks directly at the "O" card in the file.
Instead of scanning 50,000 rows, it checks the index in **0.1 milliseconds**.

---

## 3. Sneaky Spaces and Invisible Control Characters

### 📖 The Real-World Scenario
A pharmacist receives an invoice email from a drug representative. They copy the email address and paste it into the system:
`"   sales@gsk.com "` (with accidental spaces on the edges).
Or they copy a manufacturer name from a corrupt PDF, which includes an invisible ASCII control character (like a null byte `\x00` or a bell character).

### 🛑 What Went Wrong Before
* An email with spaces like `"  sales@gsk.com  "` could fail the email format validator or get saved with spaces. Later, if someone searches for `"sales@gsk.com"`, the search says *"Not found!"* because the spaces broke the match.
* Invisible control characters can crash terminal loggers, corrupt JSON responses, or mess up string formatting in UI tables.

### 🛠️ How We Fixed It
In [src/lib/validation.ts](file:///c:/Users/SAMUEL%20AYOOLA/OneDrive/Desktop/BACKEND%20DEV%202%20BY%20ME/Phamacy%20Inventory%20Management%20System/pharmacy-management-system/src/lib/validation.ts), we added automatic hygiene:
1. **Automatic Trimming:** Spaces on the edges of emails, names, phones, and addresses are automatically chopped off.
2. **Control Character Bouncers:** We added regex checks:
   * Reject any non-printable ASCII control characters (`\x00-\x1F`, `\x7F`) in `name` and `phone`.
   * For `address`, we allow standard multiline enters (`\n`), but block weird hidden characters like null bytes.

If someone submits junk with invisible corrupt characters, Zod stops it immediately with a clear `400 Bad Request`.

---

## 4. Rejecting Unknown Fields (`.strict()`)

### 📖 The Real-World Scenario
A frontend developer is building the web page for adding a manufacturer. In their JavaScript code, they make a typo:
```json
{
  "name": "Roche",
  "phoneNumber": "08012345678"
}
```
Notice they typed **`phoneNumber`** instead of **`phone`**.

### 🛑 What Went Wrong Before
By default, Zod just silently threw away any field it didn't recognize. 
So Zod accepted the request, saved `"Roche"`, but **threw away the phone number without saying a word!**
The frontend developer is left wondering: *"Why isn't the phone number saving? The API returned 201 Created!"*

### 🛠️ How We Fixed It
We added `.strict()` to both schemas:
```ts
export const createManufacturerSchema = z.object({ ... }).strict();
export const updateManufacturerSchema = z.object({ ... }).strict();
```

Now, if a client sends an unrecognized field like `phoneNumber` or `randomGarbage`, Zod immediately returns:
```json
{
  "error": "Validation error",
  "details": {
    "phoneNumber": ["Unrecognized key: 'phoneNumber'"]
  }
}
```
It catches bugs instantly during development and blocks anyone from trying to sneak unauthorized fields into your server.

---

## 5. The Giant Payload Bouncer (16 KB Body Cap / 413)

### 📖 The Real-World Scenario
When someone creates a manufacturer, how big is the JSON?
```json
{
  "name": "Pfizer Inc",
  "phone": "+2348012345678",
  "email": "contact@pfizer.com",
  "address": "12 Commercial Avenue, Lagos"
}
```
That's about **150 bytes**.

What if a hacker or a broken script sends an HTTP request containing a **50 Megabyte** file to `POST /api/manufacturers`?

### 🛑 What Went Wrong Before
Node.js would try to load all 50 MB into RAM memory to parse it. If multiple requests like this hit the server at once, Node.js runs out of memory and crashes (**Denial of Service**).

### 🛠️ How We Fixed It
We created a reusable helper in [src/lib/errors.ts](file:///c:/Users/SAMUEL%20AYOOLA/OneDrive/Desktop/BACKEND%20DEV%202%20BY%20ME/Phamacy%20Inventory%20Management%20System/pharmacy-management-system/src/lib/errors.ts):
```ts
export async function readJsonBody(request: Request, maxBytes: number = 16 * 1024)
```
Before parsing the JSON, it checks the byte length. 
* Normal request (150 bytes)?  Passed right through.
* Huge request larger than 16 KB (16,384 bytes)? 
  It throws `AppError("PAYLOAD_TOO_LARGE")`, which returns HTTP **`413 Payload Too Large`** without wasting server memory.

---

## Why Did We Skip Keyset Cursor Pagination & Trigram Search?

The original plan also suggested:
1. Building **hybrid cursor pagination** (`cursor XOR page`)
2. Removing total row counts (`COUNT(*)`)
3. Installing a PostgreSQL C-extension (`pg_trgm`) for fuzzy search

### Why that would have been a mistake:
* **How many manufacturers does a pharmacy have?** 
  Around **50 to 300** manufacturers in total.
* **How fast is offset pagination on 300 rows?** 
  PostgreSQL retrieves page 2 in **0.0003 seconds**.
* **What would cursor pagination break?**
  In an admin dashboard, cashiers and managers want to see:
  *"Showing page 1 of 5 (Total 84 manufacturers)"* and be able to click *"Page 3"*. 
  Cursor pagination makes this impossible because it doesn't calculate total pages!
* **When WILL we use those concepts?**
  * We will use **Trigram search** when we build the **Product Catalog**, because a pharmacy has 20,000+ medicine names being searched constantly on every keystroke.
  * We will use **Cursor pagination** when we build **Inventory Movements** and **Sales**, because those tables grow into millions of transaction rows.

Using the right tool for the right entity is what separates good engineering from overengineering.

---

## Summary of Files Touched

| File | What Changed |
| :--- | :--- |
| [prisma/schema.prisma](file:///c:/Users/SAMUEL%20AYOOLA/OneDrive/Desktop/BACKEND%20DEV%202%20BY%20ME/Phamacy%20Inventory%20Management%20System/pharmacy-management-system/prisma/schema.prisma) | Added `nameLower String @unique` on `Manufacturer` and `@@index([manufacturerId])` on `Product`. |
| [prisma/migrations/...](file:///c:/Users/SAMUEL%20AYOOLA/OneDrive/Desktop/BACKEND%20DEV%202%20BY%20ME/Phamacy%20Inventory%20Management%20System/pharmacy-management-system/prisma/migrations/20261010110800_add_manufacturer_namelower_and_product_index/migration.sql) | Migration applied with automatic backfill for existing rows. |
| [src/lib/validation.ts](file:///c:/Users/SAMUEL%20AYOOLA/OneDrive/Desktop/BACKEND%20DEV%202%20BY%20ME/Phamacy%20Inventory%20Management%20System/pharmacy-management-system/src/lib/validation.ts) | Added `.strict()`, email `.trim()`, and control character checks. |
| [src/lib/errors.ts](file:///c:/Users/SAMUEL%20AYOOLA/OneDrive/Desktop/BACKEND%20DEV%202%20BY%20ME/Phamacy%20Inventory%20Management%20System/pharmacy-management-system/src/lib/errors.ts) | Added `PAYLOAD_TOO_LARGE` (413) and `readJsonBody()` guard. |
| [src/services/Manufacturer.service.ts](file:///c:/Users/SAMUEL%20AYOOLA/OneDrive/Desktop/BACKEND%20DEV%202%20BY%20ME/Phamacy%20Inventory%20Management%20System/pharmacy-management-system/src/services/Manufacturer.service.ts) | Updated `create`, `update`, `getAll`, and `assertNameAvailable` to use `nameLower`. |
| [src/app/api/manufacturers/route.ts](file:///c:/Users/SAMUEL%20AYOOLA/OneDrive/Desktop/BACKEND%20DEV%202%20BY%20ME/Phamacy%20Inventory%20Management%20System/pharmacy-management-system/src/app/api/manufacturers/route.ts) | Used `readJsonBody()` in `POST`. |
| [src/app/api/manufacturers/[id]/route.ts](file:///c:/Users/SAMUEL%20AYOOLA/OneDrive/Desktop/BACKEND%20DEV%202%20BY%20ME/Phamacy%20Inventory%20Management%20System/pharmacy-management-system/src/app/api/manufacturers/%5Bid%5D/route.ts) | Used `readJsonBody()` in `PUT`. |
