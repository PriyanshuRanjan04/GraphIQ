# GraphIQ - preprocess.py
# Reads raw NDJSON files from data/raw/, cleans and normalises them, saves to data/processed/

import json
import os
import logging
from pathlib import Path
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

RAW_DIR = Path("data/raw")
PROCESSED_DIR = Path("data/processed")


# =============================================================================
# HELPERS
# =============================================================================

def read_ndjson(folder_name: str) -> list[dict]:
    """Read all NDJSON files from a subfolder of data/raw/ into a list of dicts."""
    folder = RAW_DIR / folder_name
    records = []

    if not folder.exists():
        logger.warning(f"Folder not found: {folder}")
        return records

    json_files = list(folder.glob("*.jsonl")) + list(folder.glob("*.json"))
    for file in json_files:
        logger.info(f"  Reading {file.name} ...")
        with open(file, "r", encoding="utf-8") as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError as e:
                    logger.warning(f"  Skipping invalid JSON at line {line_num} in {file.name}: {e}")

    logger.info(f"  Total records read from '{folder_name}': {len(records)}")
    return records


def normalize_date(value) -> str | None:
    """Attempt to normalize a date/datetime string to ISO format. Returns None on failure."""
    if value is None or value == "":
        return None
    if isinstance(value, str):
        for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%Y%m%d"):
            try:
                return datetime.strptime(value[:len(fmt.replace("%Y", "0000").replace("%m","00").replace("%d","00").replace("%H","00").replace("%M","00").replace("%S","00"))], fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
        return value  # Return as-is if no format matched
    return str(value)


def safe_str(value) -> str | None:
    """Convert value to string, return None if empty/null."""
    if value is None or value == "":
        return None
    return str(value).strip()


def safe_float(value) -> float | None:
    """Convert value to float, return None on failure."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def deduplicate(records: list[dict], key: str) -> list[dict]:
    """Remove duplicate records keeping the last occurrence of each key value."""
    seen = {}
    for record in records:
        k = record.get(key)
        if k is not None:
            seen[k] = record
    deduped = list(seen.values())
    logger.info(f"  Deduplicated: {len(records)} → {len(deduped)} records (key='{key}')")
    return deduped


def save_processed(data: list[dict], filename: str):
    """Save cleaned records to data/processed/<filename>.json"""
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    output_path = PROCESSED_DIR / filename
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info(f"  Saved {len(data)} records → {output_path}")


# =============================================================================
# ENTITY PREPROCESSORS
# =============================================================================

def preprocess_customers() -> list[dict]:
    """
    Reads business_partners/ → cleans → returns Customer node records.
    Primary key: businessPartner (stored as 'id' on node)
    """
    logger.info("=== Preprocessing Customers (business_partners) ===")
    raw = read_ndjson("business_partners")
    cleaned = []
    for r in raw:
        cleaned.append({
            "id":              safe_str(r.get("businessPartner")),
            "customer":        safe_str(r.get("customer")),
            "fullName":        safe_str(r.get("businessPartnerFullName")),
            "category":        safe_str(r.get("businessPartnerCategory")),
            "grouping":        safe_str(r.get("businessPartnerGrouping")),
            "language":        safe_str(r.get("correspondenceLanguage")),
            "isBlocked":       r.get("businessPartnerIsBlocked", False),
            "isArchived":      r.get("isMarkedForArchiving", False),
            "creationDate":    normalize_date(r.get("creationDate")),
        })
    cleaned = [c for c in cleaned if c["id"]]
    cleaned = deduplicate(cleaned, "id")
    save_processed(cleaned, "customers.json")
    print(f"Customers loaded: {len(cleaned)}")
    return cleaned


def preprocess_sales_orders() -> list[dict]:
    """
    Reads sales_order_headers/ → cleans → returns SalesOrder node records.
    Primary key: salesOrder
    """
    logger.info("=== Preprocessing SalesOrders (sales_order_headers) ===")
    raw = read_ndjson("sales_order_headers")
    cleaned = []
    for r in raw:
        cleaned.append({
            "id":              safe_str(r.get("salesOrder")),
            "type":            safe_str(r.get("salesOrderType")),
            "salesOrg":        safe_str(r.get("salesOrganization")),
            "soldToParty":     safe_str(r.get("soldToParty")),
            "totalAmount":     safe_float(r.get("totalNetAmount")),
            "currency":        safe_str(r.get("transactionCurrency")),
            "deliveryStatus":  safe_str(r.get("overallDeliveryStatus")),
            "billingStatus":   safe_str(r.get("overallOrdReltdBillgStatus")),
            "creationDate":    normalize_date(r.get("creationDate")),
            "requestedDeliveryDate": normalize_date(r.get("requestedDeliveryDate")),
        })
    cleaned = [c for c in cleaned if c["id"]]
    cleaned = deduplicate(cleaned, "id")
    save_processed(cleaned, "sales_orders.json")
    print(f"Sales orders loaded: {len(cleaned)}")
    return cleaned


def preprocess_deliveries() -> list[dict]:
    """
    Reads outbound_delivery_headers/ → cleans → returns Delivery node records.
    Primary key: deliveryDocument
    """
    logger.info("=== Preprocessing Deliveries (outbound_delivery_headers) ===")
    raw = read_ndjson("outbound_delivery_headers")
    cleaned = []
    for r in raw:
        cleaned.append({
            "id":                    safe_str(r.get("deliveryDocument")),
            "shippingPoint":         safe_str(r.get("shippingPoint")),
            "goodsMovementStatus":   safe_str(r.get("overallGoodsMovementStatus")),
            "pickingStatus":         safe_str(r.get("overallPickingStatus")),
            "actualGoodsMovementDate": normalize_date(r.get("actualGoodsMovementDate")),
            "creationDate":          normalize_date(r.get("creationDate")),
            "deliveryBlockReason":   safe_str(r.get("deliveryBlockReason")),
        })
    cleaned = [c for c in cleaned if c["id"]]
    cleaned = deduplicate(cleaned, "id")
    save_processed(cleaned, "deliveries.json")
    print(f"Deliveries loaded: {len(cleaned)}")
    return cleaned


def preprocess_billing_documents() -> list[dict]:
    """
    Reads billing_document_headers/ → cleans → returns BillingDocument node records.
    Primary key: billingDocument
    """
    logger.info("=== Preprocessing BillingDocuments (billing_document_headers) ===")
    raw = read_ndjson("billing_document_headers")
    cleaned = []
    for r in raw:
        cleaned.append({
            "id":                       safe_str(r.get("billingDocument")),
            "type":                     safe_str(r.get("billingDocumentType")),
            "soldToParty":              safe_str(r.get("soldToParty")),
            "totalAmount":              safe_float(r.get("totalNetAmount")),
            "currency":                 safe_str(r.get("transactionCurrency")),
            "isCancelled":              bool(r.get("billingDocumentIsCancelled", False)),
            "cancelledBillingDocument": safe_str(r.get("cancelledBillingDocument")),
            "accountingDocument":       safe_str(r.get("accountingDocument")),
            "companyCode":              safe_str(r.get("companyCode")),
            "fiscalYear":               safe_str(r.get("fiscalYear")),
            "creationDate":             normalize_date(r.get("creationDate")),
            "billingDocumentDate":      normalize_date(r.get("billingDocumentDate")),
        })
    cleaned = [c for c in cleaned if c["id"]]
    cleaned = deduplicate(cleaned, "id")
    save_processed(cleaned, "billing_documents.json")
    print(f"Billing documents loaded: {len(cleaned)}")
    return cleaned


def preprocess_payments() -> list[dict]:
    """
    Reads payments_accounts_receivable/ → cleans → returns Payment node records.
    Primary key: accountingDocument (items are kept distinct by accountingDocumentItem)
    """
    logger.info("=== Preprocessing Payments (payments_accounts_receivable) ===")
    raw = read_ndjson("payments_accounts_receivable")
    cleaned = []
    for r in raw:
        cleaned.append({
            "id":               safe_str(r.get("accountingDocument")),
            "itemId":           safe_str(r.get("accountingDocumentItem")),
            "companyCode":      safe_str(r.get("companyCode")),
            "fiscalYear":       safe_str(r.get("fiscalYear")),
            "amount":           safe_float(r.get("amountInTransactionCurrency")),
            "currency":         safe_str(r.get("transactionCurrency")),
            "customer":         safe_str(r.get("customer")),
            "clearingDate":     normalize_date(r.get("clearingDate")),
            "clearingDocument": safe_str(r.get("clearingAccountingDocument")),
            "postingDate":      normalize_date(r.get("postingDate")),
            "glAccount":        safe_str(r.get("glAccount")),
        })
    # Use composite key for deduplication
    cleaned = [c for c in cleaned if c["id"] and c["itemId"]]
    seen = set()
    deduped = []
    for c in cleaned:
        composite = f"{c['id']}_{c['itemId']}"
        if composite not in seen:
            seen.add(composite)
            c["compositeId"] = composite
            deduped.append(c)
    logger.info(f"  Deduplicated: {len(cleaned)} → {len(deduped)} records (composite key)")
    save_processed(deduped, "payments.json")
    print(f"Payments loaded: {len(deduped)}")
    return deduped


def preprocess_journal_entries() -> list[dict]:
    """
    Reads journal_entry_items_accounts_receivable/ → cleans → returns JournalEntry node records.
    Primary key: accountingDocument
    """
    logger.info("=== Preprocessing JournalEntries (journal_entry_items_accounts_receivable) ===")
    raw = read_ndjson("journal_entry_items_accounts_receivable")
    cleaned = []
    for r in raw:
        cleaned.append({
            "id":           safe_str(r.get("accountingDocument")),
            "companyCode":  safe_str(r.get("companyCode")),
            "fiscalYear":   safe_str(r.get("fiscalYear")),
            "glAccount":    safe_str(r.get("glAccount")),
            "profitCenter": safe_str(r.get("profitCenter")),
            "costCenter":   safe_str(r.get("costCenter")),
            "amount":       safe_float(r.get("amountInTransactionCurrency")),
            "currency":     safe_str(r.get("transactionCurrency")),
            "postingDate":  normalize_date(r.get("postingDate")),
            "documentDate": normalize_date(r.get("documentDate")),
        })
    cleaned = [c for c in cleaned if c["id"]]
    cleaned = deduplicate(cleaned, "id")
    save_processed(cleaned, "journal_entries.json")
    print(f"Journal entries loaded: {len(cleaned)}")
    return cleaned


def preprocess_products() -> list[dict]:
    """
    Reads products/ → cleans → returns Product node records.
    Primary key: product
    """
    logger.info("=== Preprocessing Products (products) ===")
    raw = read_ndjson("products")
    cleaned = []
    for r in raw:
        cleaned.append({
            "id":           safe_str(r.get("product")),
            "productType":  safe_str(r.get("productType")),
            "baseUnit":     safe_str(r.get("baseUnit")),
            "productGroup": safe_str(r.get("productGroup")),
            "grossWeight":  safe_float(r.get("grossWeight")),
            "netWeight":    safe_float(r.get("netWeight")),
            "weightUnit":   safe_str(r.get("weightUnit")),
        })
    cleaned = [c for c in cleaned if c["id"]]
    cleaned = deduplicate(cleaned, "id")
    save_processed(cleaned, "products.json")
    print(f"Products loaded: {len(cleaned)}")
    return cleaned


def preprocess_plants() -> list[dict]:
    """
    Reads plants/ → cleans → returns Plant node records.
    Primary key: plant
    """
    logger.info("=== Preprocessing Plants (plants) ===")
    raw = read_ndjson("plants")
    cleaned = []
    for r in raw:
        cleaned.append({
            "id":          safe_str(r.get("plant")),
            "name":        safe_str(r.get("plantName")),
            "companyCode": safe_str(r.get("companyCode")),
            "country":     safe_str(r.get("country")),
            "region":      safe_str(r.get("region")),
        })
    cleaned = [c for c in cleaned if c["id"]]
    cleaned = deduplicate(cleaned, "id")
    save_processed(cleaned, "plants.json")
    print(f"Plants loaded: {len(cleaned)}")
    return cleaned


def preprocess_sales_order_items() -> list[dict]:
    """
    Reads sales_order_items/ → cleans → used to build SalesOrder-[:CONTAINS]->Product.
    """
    logger.info("=== Preprocessing SalesOrderItems (sales_order_items) ===")
    raw = read_ndjson("sales_order_items")
    cleaned = []
    for r in raw:
        cleaned.append({
            "salesOrder":       safe_str(r.get("salesOrder")),
            "salesOrderItem":   safe_str(r.get("salesOrderItem")),
            "product":          safe_str(r.get("material") or r.get("product")),
            "requestedQty":     safe_float(r.get("requestedQuantity")),
            "netAmount":        safe_float(r.get("netAmount")),
        })
    cleaned = [c for c in cleaned if c["salesOrder"]]
    save_processed(cleaned, "sales_order_items.json")
    print(f"Sales order items loaded: {len(cleaned)}")
    return cleaned


def preprocess_billing_document_items() -> list[dict]:
    """
    Reads billing_document_items/ → cleans → used to build SalesOrder-[:HAS_BILLING]->BillingDocument.
    The raw field 'referenceSdDocument' is the delivery document number that links to outbound_delivery_items.
    """
    logger.info("=== Preprocessing BillingDocumentItems (billing_document_items) ===")
    raw = read_ndjson("billing_document_items")
    cleaned = []
    for r in raw:
        cleaned.append({
            "billingDocument":     safe_str(r.get("billingDocument")),
            "billingDocumentItem": safe_str(r.get("billingDocumentItem")),
            "referenceSdDocument": safe_str(r.get("referenceSdDocument")),
            "product":             safe_str(r.get("material") or r.get("product")),
            "netAmount":           safe_float(r.get("netAmount")),
        })
    cleaned = [c for c in cleaned if c["billingDocument"]]
    save_processed(cleaned, "billing_document_items.json")
    print(f"Billing document items loaded: {len(cleaned)}")
    return cleaned


def preprocess_outbound_delivery_items() -> list[dict]:
    """
    Reads outbound_delivery_items/ → cleans → used to build SalesOrder-[:HAS_DELIVERY]->Delivery
    and to resolve the SalesOrder-[:HAS_BILLING]->BillingDocument chain.
    Raw field 'referenceSdDocument' is the sales order number.
    """
    logger.info("=== Preprocessing OutboundDeliveryItems (outbound_delivery_items) ===")
    raw = read_ndjson("outbound_delivery_items")
    cleaned = []
    for r in raw:
        cleaned.append({
            "deliveryDocument":     safe_str(r.get("deliveryDocument")),
            "deliveryDocumentItem": safe_str(r.get("deliveryDocumentItem")),
            "referenceSdDocument":  safe_str(r.get("referenceSdDocument")),
            "plant":                safe_str(r.get("plant")),
        })
    cleaned = [c for c in cleaned if c["deliveryDocument"]]
    save_processed(cleaned, "outbound_delivery_items.json")
    print(f"Outbound delivery items loaded: {len(cleaned)}")
    return cleaned


# =============================================================================
# MASTER RUNNER
# =============================================================================

def preprocess_all_folders():
    """
    Master function: runs all entity preprocessors in order.
    Reads from data/raw/ → saves to data/processed/
    """
    logger.info("=" * 60)
    logger.info("GraphIQ — Starting full data preprocessing...")
    logger.info("=" * 60)

    preprocess_customers()
    preprocess_sales_orders()
    preprocess_deliveries()
    preprocess_billing_documents()
    preprocess_payments()
    preprocess_journal_entries()
    preprocess_products()
    preprocess_plants()
    preprocess_sales_order_items()
    preprocess_billing_document_items()
    preprocess_outbound_delivery_items()

    logger.info("=" * 60)
    logger.info("Preprocessing complete. All files saved to data/processed/")
    logger.info("=" * 60)


if __name__ == "__main__":
    preprocess_all_folders()
