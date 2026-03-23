# GraphIQ - validate.py
# Verifies the Neo4j graph was loaded correctly. Runs diagnostic Cypher queries and saves report.
# Run as: python src/ingestion/validate.py

import os
import sys
import logging
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from neo4j import GraphDatabase
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

REPORT_PATH = Path("docs/validation_report.md")
DIVIDER = "=" * 60


def get_driver():
    """Connect to Neo4j using .env credentials."""
    uri      = os.getenv("NEO4J_URI")
    username = os.getenv("NEO4J_USERNAME")
    password = os.getenv("NEO4J_PASSWORD")
    driver   = GraphDatabase.driver(uri, auth=(username, password))
    driver.verify_connectivity()
    return driver


def section(title: str) -> str:
    """Return a formatted section header string."""
    return f"\n{'='*60}\n{title}\n{'='*60}"


# =============================================================================
# VALIDATION CHECKS
# =============================================================================

def check_node_counts(session) -> dict:
    """Check 1: Count all nodes per label."""
    labels = [
        "Customer", "SalesOrder", "Delivery",
        "BillingDocument", "Payment", "JournalEntry",
        "Product", "Plant"
    ]
    counts = {}
    for label in labels:
        result = session.run(f"MATCH (n:{label}) RETURN count(n) AS cnt")
        counts[label] = result.single()["cnt"]
    return counts


def check_relationship_counts(session) -> dict:
    """Check 2: Count all relationships per type."""
    rel_types = [
        "PLACED", "HAS_DELIVERY", "HAS_BILLING",
        "CONTAINS", "POSTED_TO", "CLEARS",
        "PAID_BY", "CANCELLED_BY", "SHIPS_FROM"
    ]
    counts = {}
    for rel in rel_types:
        result = session.run(f"MATCH ()-[r:{rel}]->() RETURN count(r) AS cnt")
        counts[rel] = result.single()["cnt"]
    return counts


def sample_customers(session) -> list[dict]:
    """Check 3: Return 3 sample Customer nodes."""
    result = session.run(
        "MATCH (c:Customer) RETURN c.id AS id, c.fullName AS name LIMIT 3"
    )
    return [dict(r) for r in result]


def sample_sales_orders(session) -> list[dict]:
    """Check 4: Return 3 sample SalesOrder nodes."""
    result = session.run(
        "MATCH (s:SalesOrder) RETURN s.id AS id, s.totalAmount AS amount, s.currency AS currency LIMIT 3"
    )
    return [dict(r) for r in result]


def test_full_chain(session) -> list[dict]:
    """
    Check 5: Test one full Order-to-Cash chain.
    Customer → SalesOrder → BillingDocument → JournalEntry
    """
    result = session.run("""
        MATCH (c:Customer)-[:PLACED]->(s:SalesOrder)
              -[:HAS_BILLING]->(b:BillingDocument)
              -[:POSTED_TO]->(j:JournalEntry)
        RETURN
            c.id         AS customer,
            s.id         AS salesOrder,
            b.id         AS billingDocument,
            j.id         AS journalEntry
        LIMIT 3
    """)
    return [dict(r) for r in result]


def check_orphan_nodes(session) -> dict:
    """
    Check 6: Find nodes with zero relationships (potential data gaps).
    Returns count of orphans per label.
    """
    labels = [
        "Customer", "SalesOrder", "Delivery",
        "BillingDocument", "Payment", "JournalEntry",
        "Product", "Plant"
    ]
    orphans = {}
    for label in labels:
        result = session.run(f"""
            MATCH (n:{label})
            WHERE NOT (n)--()
            RETURN count(n) AS cnt
        """)
        orphans[label] = result.single()["cnt"]
    return orphans


# =============================================================================
# REPORT BUILDER
# =============================================================================

def build_report(
    node_counts: dict,
    rel_counts: dict,
    sample_custs: list,
    sample_orders: list,
    chain: list,
    orphans: dict,
) -> str:
    """Build the full validation report as a markdown string."""
    lines = []
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    lines.append(f"# GraphIQ — Validation Report")
    lines.append(f"> Generated: {ts}\n")

    # Node Counts
    lines.append("## ✅ Check 1: Node Counts\n")
    lines.append("| Label | Count |")
    lines.append("|---|---|")
    for label, cnt in node_counts.items():
        status = "✅" if cnt > 0 else "⚠️ EMPTY"
        lines.append(f"| {label} | {cnt:,} {status} |")

    # Relationship Counts
    lines.append("\n## ✅ Check 2: Relationship Counts\n")
    lines.append("| Type | Count |")
    lines.append("|---|---|")
    for rel, cnt in rel_counts.items():
        status = "✅" if cnt > 0 else "⚠️ EMPTY"
        lines.append(f"| {rel} | {cnt:,} {status} |")

    # Sample Customers
    lines.append("\n## ✅ Check 3: Sample Customers\n")
    if sample_custs:
        lines.append("| ID | Full Name |")
        lines.append("|---|---|")
        for c in sample_custs:
            lines.append(f"| {c['id']} | {c['name']} |")
    else:
        lines.append("> ⚠️ No customer records found.")

    # Sample Sales Orders
    lines.append("\n## ✅ Check 4: Sample Sales Orders\n")
    if sample_orders:
        lines.append("| ID | Total Amount | Currency |")
        lines.append("|---|---|---|")
        for s in sample_orders:
            lines.append(f"| {s['id']} | {s['amount']} | {s['currency']} |")
    else:
        lines.append("> ⚠️ No sales order records found.")

    # Full Chain Test
    lines.append("\n## ✅ Check 5: Order-to-Cash Chain Test\n")
    lines.append("_Expected: Customer → SalesOrder → BillingDocument → JournalEntry_\n")
    if chain:
        lines.append("| Customer | SalesOrder | BillingDocument | JournalEntry |")
        lines.append("|---|---|---|---|")
        for row in chain:
            lines.append(
                f"| {row['customer']} | {row['salesOrder']} "
                f"| {row['billingDocument']} | {row['journalEntry']} |"
            )
    else:
        lines.append("> ⚠️ No complete chains found. Check relationship loading.")

    # Orphan Nodes
    lines.append("\n## ✅ Check 6: Orphan Nodes (no relationships)\n")
    lines.append("| Label | Orphan Count | Status |")
    lines.append("|---|---|---|")
    for label, cnt in orphans.items():
        status = "✅ OK" if cnt == 0 else f"⚠️ {cnt:,} orphans"
        lines.append(f"| {label} | {cnt:,} | {status} |")

    return "\n".join(lines)


# =============================================================================
# MAIN
# =============================================================================

def run_validation():
    """Run all validation checks and save report to docs/validation_report.md"""
    logger.info(DIVIDER)
    logger.info("GraphIQ — Validation Starting")
    logger.info(DIVIDER)

    try:
        driver = get_driver()
        logger.info("Connected to Neo4j.")
    except Exception as e:
        logger.error(f"Could not connect to Neo4j: {e}")
        sys.exit(1)

    with driver.session() as session:
        logger.info("Running check 1: Node counts...")
        node_counts = check_node_counts(session)

        logger.info("Running check 2: Relationship counts...")
        rel_counts = check_relationship_counts(session)

        logger.info("Running check 3: Sample customers...")
        sample_custs = sample_customers(session)

        logger.info("Running check 4: Sample sales orders...")
        sample_orders = sample_sales_orders(session)

        logger.info("Running check 5: Full chain test...")
        chain = test_full_chain(session)

        logger.info("Running check 6: Orphan nodes...")
        orphans = check_orphan_nodes(session)

    driver.close()

    # Print summary to console
    print(section("NODE COUNTS"))
    for label, cnt in node_counts.items():
        print(f"  {label:<25} {cnt:>8,}")

    print(section("RELATIONSHIP COUNTS"))
    for rel, cnt in rel_counts.items():
        print(f"  {rel:<25} {cnt:>8,}")

    print(section("FULL CHAIN (Customer → SalesOrder → BillingDocument → JournalEntry)"))
    if chain:
        for row in chain:
            print(f"  {row}")
    else:
        print("  ⚠️  No complete chains found!")

    print(section("ORPHAN NODES"))
    for label, cnt in orphans.items():
        flag = "⚠️" if cnt > 0 else "✅"
        print(f"  {flag} {label:<24} {cnt:>6,} orphans")

    # Save markdown report
    report_md = build_report(
        node_counts, rel_counts,
        sample_custs, sample_orders,
        chain, orphans
    )
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write(report_md)
    logger.info(f"Validation report saved → {REPORT_PATH}")


if __name__ == "__main__":
    run_validation()
