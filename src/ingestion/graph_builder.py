# GraphIQ - graph_builder.py
# Loads processed JSON data into Neo4j AuraDB as nodes and relationships.
# Uses MERGE (idempotent), batch loading (500/batch), and indexes for performance.

import json
import os
import logging
from pathlib import Path
from neo4j import GraphDatabase
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

PROCESSED_DIR = Path("data/processed")
BATCH_SIZE = 500

# =============================================================================
# NEO4J CONNECTION
# =============================================================================

def get_driver():
    """Create and return a Neo4j driver instance using credentials from .env"""
    uri      = os.getenv("NEO4J_URI")
    username = os.getenv("NEO4J_USERNAME")
    password = os.getenv("NEO4J_PASSWORD")

    if not all([uri, username, password]):
        raise EnvironmentError("Missing NEO4J_URI, NEO4J_USERNAME or NEO4J_PASSWORD in .env")

    driver = GraphDatabase.driver(uri, auth=(username, password))
    driver.verify_connectivity()
    logger.info("Connected to Neo4j AuraDB successfully.")
    return driver


def load_json(filename: str) -> list[dict]:
    """Load a processed JSON file from data/processed/"""
    path = PROCESSED_DIR / filename
    if not path.exists():
        logger.warning(f"Processed file not found: {path}")
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def run_batched(session, cypher: str, records: list[dict], label: str):
    """Execute a Cypher query in batches of BATCH_SIZE."""
    total = len(records)
    for i in range(0, total, BATCH_SIZE):
        batch = records[i:i + BATCH_SIZE]
        session.run(cypher, {"batch": batch})
        logger.info(f"  [{label}] Loaded batch {i // BATCH_SIZE + 1} ({min(i + BATCH_SIZE, total)}/{total})")


# =============================================================================
# INDEXES
# =============================================================================

def create_indexes(driver):
    """
    Create Neo4j indexes on primary keys for all node labels.
    Uses IF NOT EXISTS so safe to re-run.
    """
    logger.info("Creating Neo4j indexes...")
    indexes = [
        "CREATE INDEX IF NOT EXISTS FOR (n:Customer)        ON (n.id)",
        "CREATE INDEX IF NOT EXISTS FOR (n:SalesOrder)      ON (n.id)",
        "CREATE INDEX IF NOT EXISTS FOR (n:Delivery)        ON (n.id)",
        "CREATE INDEX IF NOT EXISTS FOR (n:BillingDocument) ON (n.id)",
        "CREATE INDEX IF NOT EXISTS FOR (n:Payment)         ON (n.id)",
        "CREATE INDEX IF NOT EXISTS FOR (n:JournalEntry)    ON (n.id)",
        "CREATE INDEX IF NOT EXISTS FOR (n:Product)         ON (n.id)",
        "CREATE INDEX IF NOT EXISTS FOR (n:Plant)           ON (n.id)",
    ]
    with driver.session() as session:
        for idx in indexes:
            session.run(idx)
    logger.info("Indexes created.")


# =============================================================================
# NODE LOADERS
# =============================================================================

def load_customers(driver):
    """Load Customer nodes from customers.json into Neo4j."""
    logger.info("Loading Customer nodes...")
    records = load_json("customers.json")
    cypher = """
    UNWIND $batch AS row
    MERGE (c:Customer {id: row.id})
    SET c.customer        = row.customer,
        c.fullName        = row.fullName,
        c.category        = row.category,
        c.grouping        = row.grouping,
        c.language        = row.language,
        c.isBlocked       = row.isBlocked,
        c.isArchived      = row.isArchived,
        c.creationDate    = row.creationDate
    """
    with driver.session() as session:
        run_batched(session, cypher, records, "Customer")
    logger.info(f"Customer nodes loaded: {len(records)}")


def load_sales_orders(driver):
    """Load SalesOrder nodes from sales_orders.json into Neo4j."""
    logger.info("Loading SalesOrder nodes...")
    records = load_json("sales_orders.json")
    cypher = """
    UNWIND $batch AS row
    MERGE (s:SalesOrder {id: row.id})
    SET s.type                  = row.type,
        s.salesOrg              = row.salesOrg,
        s.soldToParty           = row.soldToParty,
        s.totalAmount           = row.totalAmount,
        s.currency              = row.currency,
        s.deliveryStatus        = row.deliveryStatus,
        s.billingStatus         = row.billingStatus,
        s.creationDate          = row.creationDate,
        s.requestedDeliveryDate = row.requestedDeliveryDate
    """
    with driver.session() as session:
        run_batched(session, cypher, records, "SalesOrder")
    logger.info(f"SalesOrder nodes loaded: {len(records)}")


def load_deliveries(driver):
    """Load Delivery nodes from deliveries.json into Neo4j."""
    logger.info("Loading Delivery nodes...")
    records = load_json("deliveries.json")
    cypher = """
    UNWIND $batch AS row
    MERGE (d:Delivery {id: row.id})
    SET d.shippingPoint           = row.shippingPoint,
        d.goodsMovementStatus     = row.goodsMovementStatus,
        d.pickingStatus           = row.pickingStatus,
        d.actualGoodsMovementDate = row.actualGoodsMovementDate,
        d.creationDate            = row.creationDate,
        d.deliveryBlockReason     = row.deliveryBlockReason
    """
    with driver.session() as session:
        run_batched(session, cypher, records, "Delivery")
    logger.info(f"Delivery nodes loaded: {len(records)}")


def load_billing_documents(driver):
    """Load BillingDocument nodes from billing_documents.json into Neo4j."""
    logger.info("Loading BillingDocument nodes...")
    records = load_json("billing_documents.json")
    cypher = """
    UNWIND $batch AS row
    MERGE (b:BillingDocument {id: row.id})
    SET b.type                     = row.type,
        b.soldToParty              = row.soldToParty,
        b.totalAmount              = row.totalAmount,
        b.currency                 = row.currency,
        b.isCancelled              = row.isCancelled,
        b.cancelledBillingDocument = row.cancelledBillingDocument,
        b.accountingDocument       = row.accountingDocument,
        b.companyCode              = row.companyCode,
        b.fiscalYear               = row.fiscalYear,
        b.creationDate             = row.creationDate,
        b.billingDocumentDate      = row.billingDocumentDate
    """
    with driver.session() as session:
        run_batched(session, cypher, records, "BillingDocument")
    logger.info(f"BillingDocument nodes loaded: {len(records)}")


def load_payments(driver):
    """Load Payment nodes from payments.json into Neo4j."""
    logger.info("Loading Payment nodes...")
    records = load_json("payments.json")
    cypher = """
    UNWIND $batch AS row
    MERGE (p:Payment {id: row.compositeId})
    SET p.accountingDocument = row.id,
        p.itemId             = row.itemId,
        p.companyCode        = row.companyCode,
        p.fiscalYear         = row.fiscalYear,
        p.amount             = row.amount,
        p.currency           = row.currency,
        p.customer           = row.customer,
        p.clearingDate       = row.clearingDate,
        p.clearingDocument   = row.clearingDocument,
        p.postingDate        = row.postingDate,
        p.glAccount          = row.glAccount
    """
    with driver.session() as session:
        run_batched(session, cypher, records, "Payment")
    logger.info(f"Payment nodes loaded: {len(records)}")


def load_journal_entries(driver):
    """Load JournalEntry nodes from journal_entries.json into Neo4j."""
    logger.info("Loading JournalEntry nodes...")
    records = load_json("journal_entries.json")
    cypher = """
    UNWIND $batch AS row
    MERGE (j:JournalEntry {id: row.id})
    SET j.companyCode  = row.companyCode,
        j.fiscalYear   = row.fiscalYear,
        j.glAccount    = row.glAccount,
        j.profitCenter = row.profitCenter,
        j.costCenter   = row.costCenter,
        j.amount       = row.amount,
        j.currency     = row.currency,
        j.postingDate  = row.postingDate,
        j.documentDate = row.documentDate
    """
    with driver.session() as session:
        run_batched(session, cypher, records, "JournalEntry")
    logger.info(f"JournalEntry nodes loaded: {len(records)}")


def load_products(driver):
    """Load Product nodes from products.json into Neo4j."""
    logger.info("Loading Product nodes...")
    records = load_json("products.json")
    cypher = """
    UNWIND $batch AS row
    MERGE (pr:Product {id: row.id})
    SET pr.productType  = row.productType,
        pr.baseUnit     = row.baseUnit,
        pr.productGroup = row.productGroup,
        pr.grossWeight  = row.grossWeight,
        pr.netWeight    = row.netWeight,
        pr.weightUnit   = row.weightUnit
    """
    with driver.session() as session:
        run_batched(session, cypher, records, "Product")
    logger.info(f"Product nodes loaded: {len(records)}")


def load_plants(driver):
    """Load Plant nodes from plants.json into Neo4j."""
    logger.info("Loading Plant nodes...")
    records = load_json("plants.json")
    cypher = """
    UNWIND $batch AS row
    MERGE (pl:Plant {id: row.id})
    SET pl.name        = row.name,
        pl.companyCode = row.companyCode,
        pl.country     = row.country,
        pl.region      = row.region
    """
    with driver.session() as session:
        run_batched(session, cypher, records, "Plant")
    logger.info(f"Plant nodes loaded: {len(records)}")


# =============================================================================
# RELATIONSHIP CREATORS
# =============================================================================

def create_customer_placed_salesorder(driver):
    """
    (:Customer)-[:PLACED]->(:SalesOrder)
    Link: Customer.id = SalesOrder.soldToParty
    """
    logger.info("Creating (:Customer)-[:PLACED]->(:SalesOrder) relationships...")
    cypher = """
    MATCH (c:Customer), (s:SalesOrder)
    WHERE c.id = s.soldToParty
    MERGE (c)-[:PLACED]->(s)
    """
    with driver.session() as session:
        result = session.run(cypher)
        summary = result.consume()
        logger.info(f"  Relationships created: {summary.counters.relationships_created}")


def create_salesorder_has_delivery(driver):
    """
    (:SalesOrder)-[:HAS_DELIVERY]->(:Delivery)
    Resolved via sales_order_items.deliveryDocument
    """
    logger.info("Creating (:SalesOrder)-[:HAS_DELIVERY]->(:Delivery) relationships...")
    items = load_json("sales_order_items.json")
    # Build unique (salesOrder, deliveryDocument) pairs
    pairs = list({
        (r["salesOrder"], r["deliveryDocument"])
        for r in items
        if r.get("salesOrder") and r.get("deliveryDocument")
    })
    records = [{"salesOrder": p[0], "deliveryDocument": p[1]} for p in pairs]

    cypher = """
    UNWIND $batch AS row
    MATCH (s:SalesOrder {id: row.salesOrder})
    MATCH (d:Delivery   {id: row.deliveryDocument})
    MERGE (s)-[:HAS_DELIVERY]->(d)
    """
    with driver.session() as session:
        run_batched(session, cypher, records, "SalesOrder-HAS_DELIVERY-Delivery")
    logger.info(f"  Pairs processed: {len(records)}")


def create_salesorder_has_billing(driver):
    """
    (:SalesOrder)-[:HAS_BILLING]->(:BillingDocument)
    Resolved via billing_document_items.salesDocument
    """
    logger.info("Creating (:SalesOrder)-[:HAS_BILLING]->(:BillingDocument) relationships...")
    items = load_json("billing_document_items.json")
    pairs = list({
        (r["salesDocument"], r["billingDocument"])
        for r in items
        if r.get("salesDocument") and r.get("billingDocument")
    })
    records = [{"salesOrder": p[0], "billingDocument": p[1]} for p in pairs]

    cypher = """
    UNWIND $batch AS row
    MATCH (s:SalesOrder      {id: row.salesOrder})
    MATCH (b:BillingDocument {id: row.billingDocument})
    MERGE (s)-[:HAS_BILLING]->(b)
    """
    with driver.session() as session:
        run_batched(session, cypher, records, "SalesOrder-HAS_BILLING-BillingDocument")
    logger.info(f"  Pairs processed: {len(records)}")


def create_salesorder_contains_product(driver):
    """
    (:SalesOrder)-[:CONTAINS]->(:Product)
    Resolved via sales_order_items.product / material
    """
    logger.info("Creating (:SalesOrder)-[:CONTAINS]->(:Product) relationships...")
    items = load_json("sales_order_items.json")
    records = [
        {
            "salesOrder": r["salesOrder"],
            "product":    r["product"],
            "qty":        r.get("requestedQty"),
            "amount":     r.get("netAmount"),
        }
        for r in items
        if r.get("salesOrder") and r.get("product")
    ]

    cypher = """
    UNWIND $batch AS row
    MATCH (s:SalesOrder {id: row.salesOrder})
    MATCH (pr:Product   {id: row.product})
    MERGE (s)-[rel:CONTAINS]->(pr)
    SET rel.requestedQty = row.qty,
        rel.netAmount    = row.amount
    """
    with driver.session() as session:
        run_batched(session, cypher, records, "SalesOrder-CONTAINS-Product")
    logger.info(f"  Pairs processed: {len(records)}")


def create_billing_posted_to_journal(driver):
    """
    (:BillingDocument)-[:POSTED_TO]->(:JournalEntry)
    Link: BillingDocument.accountingDocument = JournalEntry.id
    """
    logger.info("Creating (:BillingDocument)-[:POSTED_TO]->(:JournalEntry) relationships...")
    cypher = """
    MATCH (b:BillingDocument), (j:JournalEntry)
    WHERE b.accountingDocument = j.id
      AND b.accountingDocument IS NOT NULL
    MERGE (b)-[:POSTED_TO]->(j)
    """
    with driver.session() as session:
        result = session.run(cypher)
        summary = result.consume()
        logger.info(f"  Relationships created: {summary.counters.relationships_created}")


def create_payment_clears_billing(driver):
    """
    (:Payment)-[:CLEARS]->(:BillingDocument)
    Link: Payment.clearingDocument = BillingDocument.accountingDocument
    """
    logger.info("Creating (:Payment)-[:CLEARS]->(:BillingDocument) relationships...")
    cypher = """
    MATCH (p:Payment), (b:BillingDocument)
    WHERE p.clearingDocument = b.accountingDocument
      AND p.clearingDocument IS NOT NULL
    MERGE (p)-[:CLEARS]->(b)
    """
    with driver.session() as session:
        result = session.run(cypher)
        summary = result.consume()
        logger.info(f"  Relationships created: {summary.counters.relationships_created}")


def create_payment_paid_by_customer(driver):
    """
    (:Payment)-[:PAID_BY]->(:Customer)
    Link: Payment.customer = Customer.id
    """
    logger.info("Creating (:Payment)-[:PAID_BY]->(:Customer) relationships...")
    cypher = """
    MATCH (p:Payment), (c:Customer)
    WHERE p.customer = c.id
      AND p.customer IS NOT NULL
    MERGE (p)-[:PAID_BY]->(c)
    """
    with driver.session() as session:
        result = session.run(cypher)
        summary = result.consume()
        logger.info(f"  Relationships created: {summary.counters.relationships_created}")


def create_billing_cancelled_by(driver):
    """
    (:BillingDocument)-[:CANCELLED_BY]->(:BillingDocument)
    Link: original.cancelledBillingDocument = cancellation.id
    """
    logger.info("Creating (:BillingDocument)-[:CANCELLED_BY]->(:BillingDocument) relationships...")
    cypher = """
    MATCH (original:BillingDocument), (cancel:BillingDocument)
    WHERE original.cancelledBillingDocument = cancel.id
      AND original.cancelledBillingDocument IS NOT NULL
      AND original.id <> cancel.id
    MERGE (original)-[:CANCELLED_BY]->(cancel)
    """
    with driver.session() as session:
        result = session.run(cypher)
        summary = result.consume()
        logger.info(f"  Relationships created: {summary.counters.relationships_created}")


def create_delivery_ships_from_plant(driver):
    """
    (:Delivery)-[:SHIPS_FROM]->(:Plant)
    Link: Delivery.shippingPoint = Plant.id
    """
    logger.info("Creating (:Delivery)-[:SHIPS_FROM]->(:Plant) relationships...")
    cypher = """
    MATCH (d:Delivery), (pl:Plant)
    WHERE d.shippingPoint = pl.id
      AND d.shippingPoint IS NOT NULL
    MERGE (d)-[:SHIPS_FROM]->(pl)
    """
    with driver.session() as session:
        result = session.run(cypher)
        summary = result.consume()
        logger.info(f"  Relationships created: {summary.counters.relationships_created}")
