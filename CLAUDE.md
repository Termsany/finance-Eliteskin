# «المالية» — المتابعة المالية Elite Skin

The owner calls this app **«المالية»** (al-Maliya). The other app is **«الميدان»** (al-Midan).
When a request starts with «في المالية», the work belongs here. When it says «في الميدان», it belongs in
`Termsany/elitskincrm` (crm.eliteskinsa.com), not here. If a request names neither and it isn't obvious,
ask which app before changing anything.

- Address: finance.eliteskinsa.com · repo `Termsany/finance-Eliteskin` · no auto-deploy: after merging to
  `main` the owner runs `sudo bash /opt/elite-finance-v2/deploy/update.sh` on the server
- Users: the owner only (one password, changed from الإعدادات)
- Belongs here: the company's books from Daftra (read-only) — summary, customers and suppliers with
  statements, company expenses (Daftra + the app's own fixed/temporary/one-off), profit and loss, VAT,
  cash forecast, products and pricing, account audit, the AI advisor, Excel, settings
- Does NOT belong here: anything about the reps' field work — visits, doctors, plans, team targets,
  rep expenses. Those live in «الميدان».
- `src/lib/finance.ts` and `src/lib/daftra.ts` started as copies of «الميدان»'s; this app is now the
  reference for accounting logic.
