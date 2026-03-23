# GraphIQ - ingest.py
# Master ingestion pipeline: preprocess raw JSON → load nodes → create relationships → summarize.
# Run as: python src/ingestion/ingest.py

import logging
import sys
from pathlib import Path

# Add project root to path so imports work when run directly
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from src.ingestion.preprocess import preprocess_all_folders
from src.ingestion.graph_builder import (
    get_driver,
    create_indexes,
    # Node loaders
    load_customers,
    load_sales_orders,
    load_deliveries,
    load_billing_documents,
    load_payments,
    load_journal_entries,
    load_products,
    load_plants,
    # Relationship creators
    create_customer_placed_salesorder,
    create_salesorder_has_delivery,
    create_salesorder_has_billing,
    create_salesorder_contains_product,
    create_billing_posted_to_journal,
    create_payment_clears_billing,
    create_payment_paid_by_customer,
    create_billing_cancelled_by,
    create_delivery_ships_from_plant,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

DIVIDER = "=" * 60


def print_node_counts(driver):
    """Query and print the count of each node label in Neo4j."""
    logger.info("Fetching node counts from Neo4j...")
    labels = [
        "Customer", "SalesOrder", "Delivery",
        "BillingDocument", "Payment", "JournalEntry",
        "Product", "Plant"
    ]
    print("\n" + DIVIDER)
    print(f"{'NODE LABEL':<25} {'COUNT':>10}")
    print(DIVIDER)
    with driver.session() as session:
        for label in labels:
            result = session.run(f"MATCH (n:{label}) RETURN count(n) AS cnt")
            count = result.single()["cnt"]
            print(f"{label:<25} {count:>10,}")
    print(DIVIDER + "\n")


def print_relationship_counts(driver):
    """Query and print the count of each relationship type in Neo4j."""
    logger.info("Fetching relationship counts from Neo4j...")
    rel_types = [
        "PLACED", "HAS_DELIVERY", "HAS_BILLING",
        "CONTAINS", "POSTED_TO", "CLEARS",
        "PAID_BY", "CANCELLED_BY", "SHIPS_FROM"
    ]
    print(f"{'RELATIONSHIP TYPE':<25} {'COUNT':>10}")
    print(DIVIDER)
    with driver.session() as session:
        for rel in rel_types:
            result = session.run(f"MATCH ()-[r:{rel}]->() RETURN count(r) AS cnt")
            count = result.single()["cnt"]
            print(f"{rel:<25} {count:>10,}")
    print(DIVIDER + "\n")


def run_pipeline():
    """
    Master ingestion pipeline.
    Step 1: Preprocess raw JSON files
    Step 2: Connect to Neo4j + create indexes
    Step 3: Load all node types
    Step 4: Create all relationship types
    Step 5: Print summary counts
    """
    logger.info(DIVIDER)
    logger.info("GraphIQ — Starting Full Ingestion Pipeline")
    logger.info(DIVIDER)

    # ------------------------------------------------------------------
    # STEP 1: Preprocess
    # ------------------------------------------------------------------
    logger.info("\n[STEP 1/4] Preprocessing raw JSON files...")
    try:
        preprocess_all_folders()
        logger.info("Preprocessing complete.")
    except Exception as e:
        logger.error(f"Preprocessing failed: {e}")
        raise

    # ------------------------------------------------------------------
    # STEP 2: Connect to Neo4j + indexes
    # ------------------------------------------------------------------
    logger.info("\n[STEP 2/4] Connecting to Neo4j and creating indexes...")
    try:
        driver = get_driver()
        create_indexes(driver)
    except Exception as e:
        logger.error(f"Neo4j connection or index creation failed: {e}")
        raise

    # ------------------------------------------------------------------
    # STEP 3: Load nodes
    # ------------------------------------------------------------------
    logger.info("\n[STEP 3/4] Loading nodes into Neo4j...")
    node_loaders = [
        ("Customer",        load_customers),
        ("SalesOrder",      load_sales_orders),
        ("Delivery",        load_deliveries),
        ("BillingDocument", load_billing_documents),
        ("Payment",         load_payments),
        ("JournalEntry",    load_journal_entries),
        ("Product",         load_products),
        ("Plant",           load_plants),
    ]
    for label, loader in node_loaders:
        try:
            loader(driver)
        except Exception as e:
            logger.error(f"Failed loading {label} nodes: {e}")
            raise

    # ------------------------------------------------------------------
    # STEP 4: Create relationships
    # ------------------------------------------------------------------
    logger.info("\n[STEP 4/4] Creating relationships in Neo4j...")
    relationship_creators = [
        ("Customer-PLACED-SalesOrder",            create_customer_placed_salesorder),
        ("SalesOrder-HAS_DELIVERY-Delivery",      create_salesorder_has_delivery),
        ("SalesOrder-HAS_BILLING-BillingDocument",create_salesorder_has_billing),
        ("SalesOrder-CONTAINS-Product",           create_salesorder_contains_product),
        ("BillingDocument-POSTED_TO-JournalEntry",create_billing_posted_to_journal),
        ("Payment-CLEARS-BillingDocument",        create_payment_clears_billing),
        ("Payment-PAID_BY-Customer",              create_payment_paid_by_customer),
        ("BillingDocument-CANCELLED_BY-BillingDocument", create_billing_cancelled_by),
        ("Delivery-SHIPS_FROM-Plant",             create_delivery_ships_from_plant),
    ]
    for name, creator in relationship_creators:
        try:
            creator(driver)
        except Exception as e:
            logger.error(f"Failed creating relationship [{name}]: {e}")
            raise

    # ------------------------------------------------------------------
    # SUMMARY
    # ------------------------------------------------------------------
    logger.info("\n" + DIVIDER)
    logger.info("INGESTION COMPLETE — Summary")
    logger.info(DIVIDER)
    print_node_counts(driver)
    print_relationship_counts(driver)

    driver.close()
    logger.info("Neo4j connection closed. Pipeline finished successfully.")


if __name__ == "__main__":
    run_pipeline()
