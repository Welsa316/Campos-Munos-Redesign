// RingCentral's own description of each call log `reason` value
// (CallResultReasonEnum), copied verbatim from the RingCentral API
// specification, rc-platform.yml version 1.0.58-20240529-47eda8bd
// (https://netstorage.ringcentral.com/dpw/api-reference/specs/rc-platform.yml).
// Fax-only values are left out. Do not edit by hand: the classifier relies
// on these meanings being RingCentral's, not ours.
export const REASON_MEANING = Object.freeze({
  "Accepted": "The call was connected to and accepted by this number",
  "Connected": "The call was answered, but there was no response on how to handle the call (for example, a voice mail system answered the call and did not push \"1\" to accept)",
  "Line Busy": "The phone number you dialed was busy",
  "Not Answered": "The phone number you dialed was not answered",
  "No Answer": "You did not answer the call",
  "Hang Up": "The caller hung up before the call was answered",
  "Stopped": "This attempt was stopped because the call was answered by another phone",
  "Internal Error": "An internal error occurred when making the call. Please try again",
  "No Credit": "There was not enough Calling Credit on your account to make this call",
  "Restricted Number": "The number you dialed is restricted by RingCentral",
  "Wrong Number": "The number you dialed has either been disconnected or is not a valid phone number. Please check the number and try again",
  "International Disabled": "International calling is not enabled on your account. Contact customer service to activate International Calling",
  "International Restricted": "The country and/or area you attempted to call has been prohibited by your administrator",
  "Bad Number": "An error occurred when making the call. Please check the number before trying again",
  "Info 411 Restricted": "Calling to 411 Information Services is restricted",
  "Customer 611 Restricted": "611 customer service is not supported. Please contact customer service at <(888) 555-1212>",
  "No Digital Line": "This DigitalLine was either not plugged in or did not have an internet connection",
  "Failed Try Again": "Call failed. Please try again",
  "Max Call Limit": "The number of simultaneous calls to your account has reached its limit",
  "Too Many Calls": "The number of simultaneous calls for per DigitalLine associated with Other Phone has reached its limit. Please contact customer service",
  "Calls Not Accepted": "Your account was not accepting calls at this time",
  "Number Not Allowed": "The number that was dialed to access your account is not allowed",
  "Number Blocked": "This number is in your Blocked Numbers list",
  "Number Disabled": "The phone number and/or area you attempted to call has been prohibited by your administrator",
  "Resource Error": "An error occurred when making the call. Please try again",
  "Call Loop": "A call loop occurred due to an incorrect call forwarding configuration. Please check that you are not forwarding calls back to your own account",
  "Emergency Address not defined": "The call was rejected due to no E911 address",
  "Carrier is not active": "The call was rejected due to carrier inactivity",
  "EDGE trunk misconfigured": "The call was rejected due to error in EDGE trunk configuration",
  "Internal Call Error": "An internal error occurred when making the call. Please try again",
  "Receive Error": "Fax receive error",
})

export default REASON_MEANING
