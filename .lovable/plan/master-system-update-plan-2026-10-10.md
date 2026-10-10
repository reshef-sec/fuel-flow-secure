# Master system update — plan

This update is large, so it is delivered in 4 stages. Each stage ends working and checked before the next starts. Some stages need a short SQL script that you run in your Supabase SQL Editor (provided at that stage).

## Stage 1 — Names and dashboard (no database changes)
- Rename everywhere: "ללא חיוב לקוח" / "דוח ללא חיוב לקוח" -> "רכב פרטי"; "בחיוב לקוח" / "דו"ח B2B" / "מאגר B2B" -> "רכב עבודה" (reports tabs, settings tabs, production radio buttons).
- Production screen: label above the client search becomes "בחירת לקוח" for both options.
- Dashboard: remove bottom row of cards, remove "שוברים חסומים", merge balance + inventory into one "תקציב לניצול" card, rename "שוברים שמומשו" -> "שוברים נמסרו לעובד".
- Pending requests table: add "תפקיד" column next to "סניף".

## Stage 2 — Reports
- Filters already shared with the work-vehicle report; verify they filter it.
- Add columns to both reports: שם עובד, ת.ז, טלפון, סיבת הפקה.
- Work-vehicle report gets two views: "דוח מפורט" (every row) and "דוח מסכם" (one row per תקן: תקן, קוד לקוח, שם לקוח, סה"כ ערך).
- Serial number column ("סיריאלי") shown only to admin, in reports and the signatures archive.

## Stage 3 — Voucher production, bundling, history, expiry (SQL needed)
- Required "שם עובד" field filled by the manager; worker link asks only ID + phone, name pre-filled.
- "+ הוספת לקוח" repeats the client / amount / reason block; all blocks go into one link.
- "שוברים שהופקו" section listing recent links with copy again.
- Expiry: vouchers never expire until issued to a worker; 3 months after issue, unredeemed ones become "חסום" and disappear from the worker's link.
- SQL: add worker name, issue date and per-voucher link fields to links/vouchers.

## Stage 4 — Excel sync and access rules (SQL needed)
- Client imports (both databases): existing rows unchanged, new rows added as active, rows missing from the file marked "לא פעיל" — still shown in reports, hidden from client selection.
- Menus: branch manager and supervisor see only דשבורד, הפקת שוברי דלק, שוברים שהופקו, דוחות, ארכיון חתימות.
- Data: branch manager sees own branch only (including the signatures archive); supervisor sees only own data.
- Request/allocation user list: admin sees all users allowed to request; branch manager only those in their branch.
- SQL: add an active/inactive status to both client tables.

## Already done
- The signatures archive exists from the previous update; only the access rules above are added to it.

## Technical notes
- External Supabase project; schema changes are delivered as SQL scripts for the user to run, and code tolerates missing new columns until then.
- Expiry is enforced when vouchers load and when the worker link opens (no scheduled job needed).
