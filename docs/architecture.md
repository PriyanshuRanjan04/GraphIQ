# GraphIQ — Architecture Documentation

## System Overview

GraphIQ translates SAP Order-to-Cash business data into an interactive Neo4j knowledge graph,
allowing users to query entity relationships in plain English via an LLM-powered chat interface.

---

## High-Level Flow

```
User Query (Natural Language)
   ↓
Guardrail Check (off-topic? → reject)
   ↓
LLM (Groq Llama 3 70B) + Graph Schema Context → Cypher Query
   ↓
Cypher Safety Validation (only MATCH/RETURN allowed)
   ↓
Neo4j AuraDB → Query Results
   ↓
LLM → Human-Readable Response
   ↓
Frontend → Chat answer + Cytoscape graph highlight
```

---

## Neo4j Graph Model

### Node Definitions

| Label | Primary Key | Source File | Key Properties |
|---|---|---|---|
| `Customer` | `customer` | `business_partners` | fullName, category, isBlocked, creationDate |
| `SalesOrder` | `salesOrder` | `sales_order_headers` | salesOrderType, soldToParty, totalNetAmount, deliveryStatus, billingStatus |
| `Delivery` | `deliveryDocument` | `outbound_delivery_headers` | shippingPoint, goodsMovementStatus, pickingStatus, actualGoodsMovementDate |
| `BillingDocument` | `billingDocument` | `billing_document_headers` | billingDocumentType, soldToParty, totalNetAmount, accountingDocument, isCancelled |
| `JournalEntry` | `accountingDocument` | `journal_entry_items_accounts_receivable` | companyCode, fiscalYear, postingDate, glAccount, amount |
| `Payment` | `accountingDocument` + `accountingDocumentItem` | `payments_accounts_receivable` | clearingDate, clearingAccountingDocument, amount, customer |
| `Product` | `product` | `products` | productType, baseUnit, productGroup, grossWeight |
| `Plant` | `plant` | `plants` | plantName, companyCode, country, region |
| `Address` | `addressID` | `business_partner_addresses` | streetName, cityName, postalCode, country |

---

### Relationship Definitions

| Relationship | Direction | Linking Fields | Meaning |
|---|---|---|---|
| `PLACED` | `(:Customer)→(:SalesOrder)` | `Customer.customer = SalesOrder.soldToParty` | Customer placed a sales order |
| `HAS_DELIVERY` | `(:SalesOrder)→(:Delivery)` | via `sales_order_items` + `outbound_delivery_items` | Sales order has an outbound delivery |
| `HAS_BILLING` | `(:SalesOrder)→(:BillingDocument)` | via `billing_document_items.salesOrder` | Sales order was billed |
| `CONTAINS` | `(:SalesOrder)→(:Product)` | via `sales_order_items.material` | Sales order line items link to products |
| `POSTED_TO` | `(:BillingDocument)→(:JournalEntry)` | `BillingDocument.accountingDocument = JournalEntry.accountingDocument` | Billing doc creates a GL journal entry |
| `CANCELLED_BY` | `(:BillingDocument)→(:BillingDocument)` | `BillingDocument.cancelledBillingDocument = BillingDocument.billingDocument` | Original billing doc cancelled by another |
| `CLEARS` | `(:Payment)→(:BillingDocument)` | `Payment.clearingAccountingDocument = BillingDocument.accountingDocument` | Payment settles a billing document |
| `PAID_BY` | `(:Payment)→(:Customer)` | `Payment.customer = Customer.customer` | Payment made by a customer |
| `SHIPS_FROM` | `(:Delivery)→(:Plant)` | `Delivery.shippingPoint = Plant.plant` | Delivery ships from a plant/warehouse |
| `HAS_ADDRESS` | `(:Customer)→(:Address)` | `Customer.customer = Address.businessPartner` | Customer has a registered address |

---

### Full Graph Diagram (Text)

```
(Customer)
    │
    ├─[:PLACED]──────────────────► (SalesOrder)
    │                                   │
    │                                   ├─[:HAS_DELIVERY]──► (Delivery)─[:SHIPS_FROM]──► (Plant)
    │                                   │
    │                                   ├─[:HAS_BILLING]───► (BillingDocument)─[:POSTED_TO]──► (JournalEntry)
    │                                   │                          │
    │                                   │                          └─[:CANCELLED_BY]──► (BillingDocument)
    │                                   │
    │                                   └─[:CONTAINS]──────► (Product)
    │
    ├─[:HAS_ADDRESS]─────────────► (Address)
    │
    └──────────── (Payment)─[:CLEARS]────► (BillingDocument)
                      │
                      └─[:PAID_BY]──────► (Customer)
```

---

## Key Linking Fields Between Source Files

| Join | From Field | To Field |
|---|---|---|
| SalesOrder → Customer | `sales_order_headers.soldToParty` | `business_partners.customer` |
| BillingDocument → Customer | `billing_document_headers.soldToParty` | `business_partners.customer` |
| BillingDocument → JournalEntry | `billing_document_headers.accountingDocument` | `journal_entry_items_accounts_receivable.accountingDocument` |
| Payment → Customer | `payments_accounts_receivable.customer` | `business_partners.customer` |
| Payment → BillingDocument | `payments_accounts_receivable.clearingAccountingDocument` | `billing_document_headers.accountingDocument` |
| BillingDocument → BillingDocument | `billing_document_headers.cancelledBillingDocument` | `billing_document_headers.billingDocument` |
| SalesOrder → BillingDocument | `billing_document_items.salesOrder` | `billing_document_headers.billingDocument` |
| SalesOrder → Delivery | `sales_order_items.salesOrder` | `outbound_delivery_items.salesOrder` |
| Delivery → Plant | `outbound_delivery_headers.shippingPoint` | `plants.plant` |
| SalesOrder → Product | `sales_order_items.material` | `products.product` |
| Customer → Address | `business_partner_addresses.businessPartner` | `business_partners.customer` |

---

## Component Responsibilities

| Component | File | Role |
|---|---|---|
| **Graph Schema** | `src/ingestion/graph_schema.py` | Single source of truth — defines all nodes, relationships, linking keys |
| **Preprocessor** | `src/ingestion/preprocess.py` | Reads raw JSON → cleans → writes processed files |
| **Graph Builder** | `src/ingestion/graph_builder.py` | Loads processed data → creates Neo4j nodes + relationships |
| **Neo4j Service** | `src/backend/services/neo4j_service.py` | DB connection + Cypher execution layer |
| **LLM Service** | `src/backend/services/llm_service.py` | Prompt building + Groq API calls (NL → Cypher) |
| **Guardrails** | `src/backend/services/guardrails.py` | Off-topic detection + Cypher safety validation |
| **Graph Service** | `src/backend/services/graph_service.py` | Formats DB results → Cytoscape JSON |
| **Chat Router** | `src/backend/routers/chat.py` | POST /api/chat endpoint |
| **Graph Router** | `src/backend/routers/graph.py` | GET /api/graph endpoint |

---

## Dataset Source Files (19 Folders)

### Primary Entity Files
- `sales_order_headers` — Core SalesOrder nodes
- `billing_document_headers` — BillingDocument nodes
- `outbound_delivery_headers` — Delivery nodes
- `payments_accounts_receivable` — Payment nodes
- `business_partners` — Customer nodes
- `products` — Product nodes
- `plants` — Plant nodes
- `business_partner_addresses` — Address nodes

### Supporting / Joining Files
- `sales_order_items` — Links SalesOrder → Product, SalesOrder → Delivery
- `billing_document_items` — Links SalesOrder → BillingDocument
- `outbound_delivery_items` — Link join for Delivery
- `journal_entry_items_accounts_receivable` — JournalEntry nodes
- `billing_document_cancellations` — Supports CANCELLED_BY relationship
- `customer_company_assignments` — Customer ↔ CompanyCode data
- `customer_sales_area_assignments` — Sales area metadata
- `product_descriptions` — Enriches Product nodes with names
- `product_plants` — Links Product → Plant
- `product_storage_locations` — Storage location metadata
- `sales_order_schedule_lines` — Delivery scheduling metadata
