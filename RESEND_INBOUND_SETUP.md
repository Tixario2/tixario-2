## Resend Inbound Email Setup

1. Go to Resend dashboard → Inbound
2. Add inbound email domain: zenntry.com
3. Create two routes:
   - drops-adrien@zenntry.com → POST https://zenntry.com/api/ingest/email
   - drops-archie@zenntry.com → POST https://zenntry.com/api/ingest/email
4. Add MX record to DNS: 10 inbound.resend.com
5. Add RESEND_INBOUND_SECRET to Vercel env vars for webhook verification
