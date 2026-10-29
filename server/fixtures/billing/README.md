# Billing import fixtures

Every file in this folder is **synthetic**. The clients ("Prueba Uno",
"Ana Ejemplo", "Prueba Ñandú Pérez", ...), the ids (`EIM-C-0001`,
`INV-1001`, `PAY-5001`) and the amounts are invented for tests. None of it
comes from a real person or a real eImmigration account.

The column layouts are **guesses**, not eImmigration's verified export
format. They exist to exercise the parsers, the column-alias detection and
the normalizer. Until a real eImmigration export has been compared against
them (and `ALIASES_VERIFIED` in `billing/columnMapping.js` flipped to
`true`), nothing here proves that a real export will import correctly.

| File | What it exercises |
| --- | --- |
| `invoice_summary.csv` | paid, partial, unpaid, overdue, void, a payment-plan invoice, one client with three invoices, two clients sharing a name with different ids, accented names, a balance mismatch, an unknown status |
| `outstanding_only.csv` | balance-only report (no totals) |
| `payments.csv` | payments, a credit, a refund in parentheses, a negative payment, a conflicting duplicate payment id, an exact repeated row, an unknown transaction type |
| `mixed.csv` | invoice rows and payment rows in one file |
| `with_title_rows.csv` | two title lines above the header |
| `semicolon.csv` | `;` delimiter, quoted `;`, European amounts, an ambiguous `250,00`, a day-first date that must be rejected |
| `invoice_summary.xlsx` | shared and inline strings, built-in and custom date formats, a sparse row, a computed double, a second sheet |

`invoice_summary.xlsx` is generated; regenerate it with:

    node fixtures/billing/make-xlsx.js

A test checks that the committed file matches the generator output.
