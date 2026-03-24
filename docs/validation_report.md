# GraphIQ — Validation Report
> Generated: 2026-03-25 00:13:06

## ✅ Check 1: Node Counts

| Label | Count |
|---|---|
| Customer | 0 ⚠️ EMPTY |
| SalesOrder | 0 ⚠️ EMPTY |
| Delivery | 0 ⚠️ EMPTY |
| BillingDocument | 0 ⚠️ EMPTY |
| Payment | 0 ⚠️ EMPTY |
| JournalEntry | 0 ⚠️ EMPTY |
| Product | 0 ⚠️ EMPTY |
| Plant | 0 ⚠️ EMPTY |

## ✅ Check 2: Relationship Counts

| Type | Count |
|---|---|
| PLACED | 0 ⚠️ EMPTY |
| HAS_DELIVERY | 0 ⚠️ EMPTY |
| HAS_BILLING | 0 ⚠️ EMPTY |
| CONTAINS | 0 ⚠️ EMPTY |
| POSTED_TO | 0 ⚠️ EMPTY |
| CLEARS | 0 ⚠️ EMPTY |
| PAID_BY | 0 ⚠️ EMPTY |
| CANCELLED_BY | 0 ⚠️ EMPTY |
| SHIPS_FROM | 0 ⚠️ EMPTY |

## ✅ Check 3: Sample Customers

> ⚠️ No customer records found.

## ✅ Check 4: Sample Sales Orders

> ⚠️ No sales order records found.

## ✅ Check 5: Order-to-Cash Chain Test

_Expected: Customer → SalesOrder → BillingDocument → JournalEntry_

> ⚠️ No complete chains found. Check relationship loading.

## ✅ Check 6: Orphan Nodes (no relationships)

| Label | Orphan Count | Status |
|---|---|---|
| Customer | 0 | ✅ OK |
| SalesOrder | 0 | ✅ OK |
| Delivery | 0 | ✅ OK |
| BillingDocument | 0 | ✅ OK |
| Payment | 0 | ✅ OK |
| JournalEntry | 0 | ✅ OK |
| Product | 0 | ✅ OK |
| Plant | 0 | ✅ OK |