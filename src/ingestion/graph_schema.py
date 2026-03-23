# GraphIQ - graph_schema.py
# Single source of truth for the Neo4j graph model.
# Defines all node types, relationship types, and field mappings from source JSON files.
# Used by: graph_builder.py (ingestion), llm_service.py (LLM prompting), docs/architecture.md

# =============================================================================
# NODE DEFINITIONS
# Each entry defines:
#   - label:      Neo4j node label
#   - source:     Source JSON folder/file
#   - primary_key: Field used as the unique Neo4j ID
#   - properties: Key fields to store on the node
# =============================================================================

NODES = {

    "Customer": {
        "label": "Customer",
        "source": "business_partners",
        "primary_key": "customer",  # = businessPartner in some contexts
        "properties": [
            "customer",
            "businessPartnerFullName",
            "businessPartnerCategory",   # 1=Person, 2=Org
            "businessPartnerGrouping",
            "creationDate",
            "businessPartnerIsBlocked",
            "isMarkedForArchiving",
        ],
        "notes": "Core entity. businessPartner.customer is the linking key across all other entities.",
    },

    "SalesOrder": {
        "label": "SalesOrder",
        "source": "sales_order_headers",
        "primary_key": "salesOrder",
        "properties": [
            "salesOrder",
            "salesOrderType",
            "salesOrganization",
            "soldToParty",              # FK → Customer.customer
            "creationDate",
            "totalNetAmount",
            "transactionCurrency",
            "overallDeliveryStatus",
            "overallOrdReltdBillgStatus",
        ],
        "notes": "soldToParty links SalesOrder → Customer.",
    },

    "Delivery": {
        "label": "Delivery",
        "source": "outbound_delivery_headers",
        "primary_key": "deliveryDocument",
        "properties": [
            "deliveryDocument",
            "creationDate",
            "shippingPoint",            # FK → Plant.plant (loosely)
            "overallGoodsMovementStatus",
            "overallPickingStatus",
            "actualGoodsMovementDate",
            "deliveryBlockReason",
        ],
        "notes": "Linked to SalesOrder via sales_order_items.salesOrder → outbound_delivery_items.deliveryDocument.",
    },

    "BillingDocument": {
        "label": "BillingDocument",
        "source": "billing_document_headers",
        "primary_key": "billingDocument",
        "properties": [
            "billingDocument",
            "billingDocumentType",
            "soldToParty",              # FK → Customer.customer
            "billingDocumentDate",
            "totalNetAmount",
            "transactionCurrency",
            "companyCode",
            "accountingDocument",       # FK → JournalEntry.accountingDocument
            "billingDocumentIsCancelled",
            "cancelledBillingDocument", # FK → BillingDocument (self-reference)
        ],
        "notes": "accountingDocument links BillingDocument → JournalEntry. cancelledBillingDocument is a self-referencing FK.",
    },

    "JournalEntry": {
        "label": "JournalEntry",
        "source": "journal_entry_items_accounts_receivable",
        "primary_key": "accountingDocument",
        "properties": [
            "accountingDocument",
            "companyCode",
            "fiscalYear",
            "postingDate",
            "documentDate",
            "glAccount",
            "amountInTransactionCurrency",
            "transactionCurrency",
        ],
        "notes": "Represents an accounting/GL posting. Linked from BillingDocument via accountingDocument.",
    },

    "Payment": {
        "label": "Payment",
        "source": "payments_accounts_receivable",
        "primary_key": "accountingDocument",  # composite: accountingDocument + accountingDocumentItem
        "properties": [
            "accountingDocument",
            "accountingDocumentItem",
            "companyCode",
            "fiscalYear",
            "clearingDate",
            "clearingAccountingDocument",   # FK → BillingDocument.accountingDocument
            "amountInTransactionCurrency",
            "transactionCurrency",
            "customer",                     # FK → Customer.customer
            "postingDate",
        ],
        "notes": "clearingAccountingDocument links Payment → BillingDocument (via accountingDocument). customer links Payment → Customer.",
    },

    "Product": {
        "label": "Product",
        "source": "products",
        "primary_key": "product",
        "properties": [
            "product",
            "productType",
            "baseUnit",
            "productGroup",
            "grossWeight",
            "netWeight",
            "weightUnit",
        ],
        "notes": "Enriched by product_descriptions for human-readable names. Linked to SalesOrder via sales_order_items.",
    },

    "Plant": {
        "label": "Plant",
        "source": "plants",
        "primary_key": "plant",
        "properties": [
            "plant",
            "plantName",
            "companyCode",
            "country",
            "region",
        ],
        "notes": "Referenced by Delivery.shippingPoint.",
    },

    "Address": {
        "label": "Address",
        "source": "business_partner_addresses",
        "primary_key": "addressID",    # businessPartner + addressID as composite
        "properties": [
            "businessPartner",          # FK → Customer.customer
            "addressID",
            "streetName",
            "cityName",
            "postalCode",
            "country",
            "region",
        ],
        "notes": "Linked to Customer via businessPartner field.",
    },
}


# =============================================================================
# RELATIONSHIP DEFINITIONS
# Each entry defines:
#   - from_label:     Source node label
#   - to_label:       Target node label
#   - type:           Neo4j relationship type (UPPER_SNAKE_CASE)
#   - from_key:       Field on source node used to find the match
#   - to_key:         Field on target node used to find the match
#   - properties:     Optional properties on the relationship
#   - meaning:        Human-readable description
# =============================================================================

RELATIONSHIPS = {

    "CUSTOMER_PLACED_SALESORDER": {
        "from_label": "Customer",
        "to_label": "SalesOrder",
        "type": "PLACED",
        "from_key": "customer",
        "to_key": "soldToParty",
        "properties": [],
        "meaning": "A Customer placed a SalesOrder.",
        "cypher": "MATCH (c:Customer), (s:SalesOrder) WHERE c.customer = s.soldToParty CREATE (c)-[:PLACED]->(s)",
    },

    "SALESORDER_HAS_DELIVERY": {
        "from_label": "SalesOrder",
        "to_label": "Delivery",
        "type": "HAS_DELIVERY",
        "from_key": "salesOrder",           # via sales_order_items → outbound_delivery_items
        "to_key": "deliveryDocument",
        "properties": [],
        "meaning": "A SalesOrder has an associated outbound Delivery.",
        "cypher": "MATCH (s:SalesOrder), (d:Delivery) WHERE s.salesOrder = d.referredSalesOrder CREATE (s)-[:HAS_DELIVERY]->(d)",
        "notes": "Resolved via join: sales_order_items.salesOrder → outbound_delivery_items.salesOrder",
    },

    "SALESORDER_HAS_BILLING": {
        "from_label": "SalesOrder",
        "to_label": "BillingDocument",
        "type": "HAS_BILLING",
        "from_key": "salesOrder",           # via billing_document_items
        "to_key": "billingDocument",
        "properties": [],
        "meaning": "A SalesOrder is billed via a BillingDocument.",
        "notes": "Resolved via billing_document_items.salesOrder → billing_document_headers.billingDocument",
    },

    "BILLINGDOCUMENT_POSTED_TO": {
        "from_label": "BillingDocument",
        "to_label": "JournalEntry",
        "type": "POSTED_TO",
        "from_key": "accountingDocument",
        "to_key": "accountingDocument",
        "properties": [],
        "meaning": "A BillingDocument creates a JournalEntry in accounting.",
        "cypher": "MATCH (b:BillingDocument), (j:JournalEntry) WHERE b.accountingDocument = j.accountingDocument CREATE (b)-[:POSTED_TO]->(j)",
    },

    "PAYMENT_CLEARS_BILLINGDOCUMENT": {
        "from_label": "Payment",
        "to_label": "BillingDocument",
        "type": "CLEARS",
        "from_key": "clearingAccountingDocument",
        "to_key": "accountingDocument",
        "properties": [],
        "meaning": "A Payment clears (settles) a BillingDocument.",
        "cypher": "MATCH (p:Payment), (b:BillingDocument) WHERE p.clearingAccountingDocument = b.accountingDocument CREATE (p)-[:CLEARS]->(b)",
    },

    "PAYMENT_PAID_BY_CUSTOMER": {
        "from_label": "Payment",
        "to_label": "Customer",
        "type": "PAID_BY",
        "from_key": "customer",
        "to_key": "customer",
        "properties": [],
        "meaning": "A Payment was made by a Customer.",
        "cypher": "MATCH (p:Payment), (c:Customer) WHERE p.customer = c.customer CREATE (p)-[:PAID_BY]->(c)",
    },

    "BILLINGDOCUMENT_CANCELLED_BY": {
        "from_label": "BillingDocument",
        "to_label": "BillingDocument",
        "type": "CANCELLED_BY",
        "from_key": "cancelledBillingDocument",
        "to_key": "billingDocument",
        "properties": [],
        "meaning": "A BillingDocument was cancelled and replaced by another BillingDocument.",
        "cypher": "MATCH (original:BillingDocument), (cancel:BillingDocument) WHERE original.billingDocument = cancel.cancelledBillingDocument CREATE (original)-[:CANCELLED_BY]->(cancel)",
    },

    "DELIVERY_SHIPS_FROM_PLANT": {
        "from_label": "Delivery",
        "to_label": "Plant",
        "type": "SHIPS_FROM",
        "from_key": "shippingPoint",
        "to_key": "plant",
        "properties": [],
        "meaning": "A Delivery ships from a Plant/shipping point.",
        "cypher": "MATCH (d:Delivery), (pl:Plant) WHERE d.shippingPoint = pl.plant CREATE (d)-[:SHIPS_FROM]->(pl)",
    },

    "SALESORDER_CONTAINS_PRODUCT": {
        "from_label": "SalesOrder",
        "to_label": "Product",
        "type": "CONTAINS",
        "from_key": "salesOrder",           # via sales_order_items
        "to_key": "product",
        "properties": [
            "requestedQuantity",
            "netAmount",
            "orderQuantityUnit",
        ],
        "meaning": "A SalesOrder contains (line items of) one or more Products.",
        "notes": "Resolved via sales_order_items.salesOrder + sales_order_items.material",
    },

    "CUSTOMER_HAS_ADDRESS": {
        "from_label": "Customer",
        "to_label": "Address",
        "type": "HAS_ADDRESS",
        "from_key": "customer",
        "to_key": "businessPartner",
        "properties": [],
        "meaning": "A Customer has one or more Addresses.",
        "cypher": "MATCH (c:Customer), (a:Address) WHERE c.customer = a.businessPartner CREATE (c)-[:HAS_ADDRESS]->(a)",
    },
}


# =============================================================================
# LINKING FIELDS SUMMARY
# Quick reference for which fields join source files together
# =============================================================================

LINKING_FIELDS = {
    "SalesOrder → Customer":        ("sales_order_headers.soldToParty",     "business_partners.customer"),
    "BillingDocument → Customer":   ("billing_document_headers.soldToParty", "business_partners.customer"),
    "BillingDocument → JournalEntry": ("billing_document_headers.accountingDocument", "journal_entry_items_accounts_receivable.accountingDocument"),
    "Payment → Customer":           ("payments_accounts_receivable.customer", "business_partners.customer"),
    "Payment → BillingDocument":    ("payments_accounts_receivable.clearingAccountingDocument", "billing_document_headers.accountingDocument"),
    "BillingDocument → BillingDocument (cancel)": ("billing_document_headers.cancelledBillingDocument", "billing_document_headers.billingDocument"),
    "SalesOrder → BillingDocument": ("billing_document_items.salesOrder",    "billing_document_headers.billingDocument"),
    "SalesOrder → Delivery":        ("sales_order_items.salesOrder",         "outbound_delivery_items.salesOrder"),
    "Delivery → Plant":             ("outbound_delivery_headers.shippingPoint", "plants.plant"),
    "SalesOrder → Product":         ("sales_order_items.material",           "products.product"),
    "Customer → Address":           ("business_partner_addresses.businessPartner", "business_partners.customer"),
}


# =============================================================================
# SCHEMA SUMMARY (used to inject into LLM system prompt)
# =============================================================================

SCHEMA_SUMMARY = """
GraphIQ Neo4j Graph Schema — SAP Order-to-Cash

NODE LABELS & PRIMARY KEYS:
  - Customer          (customer)
  - SalesOrder        (salesOrder)
  - Delivery          (deliveryDocument)
  - BillingDocument   (billingDocument)
  - JournalEntry      (accountingDocument)
  - Payment           (accountingDocument + accountingDocumentItem)
  - Product           (product)
  - Plant             (plant)
  - Address           (addressID)

RELATIONSHIPS:
  (:Customer)-[:PLACED]->(:SalesOrder)
  (:SalesOrder)-[:HAS_DELIVERY]->(:Delivery)
  (:SalesOrder)-[:HAS_BILLING]->(:BillingDocument)
  (:SalesOrder)-[:CONTAINS]->(:Product)
  (:BillingDocument)-[:POSTED_TO]->(:JournalEntry)
  (:BillingDocument)-[:CANCELLED_BY]->(:BillingDocument)
  (:Payment)-[:CLEARS]->(:BillingDocument)
  (:Payment)-[:PAID_BY]->(:Customer)
  (:Delivery)-[:SHIPS_FROM]->(:Plant)
  (:Customer)-[:HAS_ADDRESS]->(:Address)
"""
