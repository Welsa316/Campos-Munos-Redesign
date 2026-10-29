// Billing data sources. The rest of the module consumes ParsedTable /
// normalized records and does not care which source produced them.
//
//   FileImportBillingProvider — live: staff upload an eImmigration export.
//   EImmigrationApiProvider   — boundary only. eImmigration's documentation
//     names these endpoints, but their request/response schemas are not
//     published to us yet, so nothing here calls them:
//       GET /{tenant}/api/v1/Invoices
//       GET /{tenant}/api/v1/Invoices/{invoiceID}
//       GET /{tenant}/api/v1/Invoices/{invoiceID}/InvoiceItems
//       GET /{tenant}/api/v1/Invoices/{invoiceID}/Payments
//       GET /{tenant}/api/v1/Invoices/{invoiceID}/PaymentPlan
//       GET /{tenant}/api/v1/InvoicePayment
//     POST /InvoicePayment (creating payments in eImmigration) is out of scope
//     and must not be added: this platform does not create financial
//     transactions in eImmigration.
//     To activate: implement fetchInvoices() against the verified Swagger
//     schema, map fields into NormalizedInvoice / NormalizedPayment
//     (server/billing/model.js), and feed them to the same preview/approve
//     pipeline (importService.js) with source = 'eimmigration_api'.
import { parseReport } from '../../parsers/index.js'

export function createFileImportBillingProvider() {
  return {
    kind: 'file_import',
    describe: () => ({ kind: 'file_import', status: 'connected', detail: 'Staff upload CSV or XLSX exports' }),
    readReport: (buffer, { filename }) => parseReport(buffer, { filename }),
  }
}

export function createEImmigrationApiProvider(env = process.env) {
  const configured = Boolean(env.EIMMIGRATION_API_BASE_URL && env.EIMMIGRATION_TENANT)
  return {
    kind: 'eimmigration_api',
    describe: () => ({
      kind: 'eimmigration_api',
      status: configured ? 'configured_unverified' : 'not_configured',
      detail: configured
        ? 'Base URL and tenant are set, but the adapter waits for the verified API schema; no calls are made.'
        : 'Waiting for API access and documentation from eImmigration.',
    }),
    async fetchInvoices() {
      throw Object.assign(new Error('The eImmigration API adapter is not implemented until its schema is verified'), { code: 'not_implemented' })
    },
  }
}
