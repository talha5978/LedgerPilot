-- ============================================================
-- LedgerPilot – Demo Seed Data
-- File: 0002_seed_demo_data.sql
-- 
-- IMPORTANT SETUP INSTRUCTIONS
-- ----------------------------------------------------------
-- 1. First create a real user in Supabase Auth (Dashboard → Authentication → Users)
--    Recommended email: demo@ledgerpilot.dev
--    Password: anything you like
--
-- 2. Copy the UUID of that user (it looks like: a1b2c3d4-e5f6-7890-abcd-ef1234567890)
--
-- 3. Replace EVERY occurrence of the placeholder below with that real UUID:
--
--        '0f060ade-7a78-4e4d-a6f0-1fb4486db461'
--
-- 4. Then run this entire script in the SQL Editor.
-- ============================================================

-- Fixed demo profile UUID (REPLACE THIS with your real auth.users.id)
-- After replacing, the rest of the seed will work.
do $$
declare
  demo_profile_id uuid := '0f060ade-7a78-4e4d-a6f0-1fb4486db461';  -- ← CHANGE THIS
begin

  -- ----------------------------------------------------------
  -- Clean previous demo data (safe to re-run)
  -- ----------------------------------------------------------
  delete from public.audit_log          where profile_id = demo_profile_id;
  delete from public.pending_actions    where profile_id = demo_profile_id;
  delete from public.annotations        where entity_id in (
    select id from public.transactions where profile_id = demo_profile_id
    union
    select id from public.invoices     where profile_id = demo_profile_id
  );
  delete from public.matches            where transaction_id in (
    select id from public.transactions where profile_id = demo_profile_id
  );
  delete from public.transactions       where profile_id = demo_profile_id;
  delete from public.invoices           where profile_id = demo_profile_id;
  delete from public.clients            where profile_id = demo_profile_id;

  -- Ensure the profile row exists (in case trigger already created it)
  insert into public.profiles (id, email, full_name, paypal_merchant_id)
  values (
    demo_profile_id,
    'demo@ledgerpilot.dev',
    'Alex Rivera (Demo Freelancer)',
    'DEMO-MERCHANT-001'
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    paypal_merchant_id = excluded.paypal_merchant_id;

  -- ============================================================
  -- CLIENTS
  -- ============================================================
  insert into public.clients (id, profile_id, name, email, paypal_payer_id, notes) values
  ('11111111-1111-1111-1111-111111111101', demo_profile_id, 'Acme Design Studio',   'billing@acmedesign.co',   'PAYER-ACME-01',   'Long-term client. Usually pays on time.'),
  ('11111111-1111-1111-1111-111111111102', demo_profile_id, 'BrightTech Solutions', 'ap@brighttech.io',       'PAYER-BRIGHT-02', 'Pays in bulk sometimes.'),
  ('11111111-1111-1111-1111-111111111103', demo_profile_id, 'GreenLeaf Consulting', 'finance@greenleaf.com',  'PAYER-GREEN-03',  'Often pays late.'),
  ('11111111-1111-1111-1111-111111111104', demo_profile_id, 'Nova Media',           'accounts@novamedia.tv',  null,              'New client – payer ID not yet linked.');

  -- ============================================================
  -- INVOICES
  -- ============================================================
  insert into public.invoices (
    id, profile_id, client_id, paypal_invoice_id, invoice_number,
    amount, currency, status, due_date, issue_date, description, source
  ) values
  -- Acme – fully paid (exact match later)
  ('22222222-2222-2222-2222-222222222201', demo_profile_id, '11111111-1111-1111-1111-111111111101',
   'INV-PAYPAL-001', 'INV-2026-001', 1200.00, 'USD', 'paid',
   '2026-09-15', '2026-08-15', 'Brand identity package', 'simulator'),

  -- Acme – partially paid
  ('22222222-2222-2222-2222-222222222202', demo_profile_id, '11111111-1111-1111-1111-111111111101',
   'INV-PAYPAL-002', 'INV-2026-002', 850.00, 'USD', 'partially_paid',
   '2026-10-10', '2026-09-10', 'Website redesign – Phase 1', 'simulator'),

  -- BrightTech – two invoices that will be paid in one bulk payment
  ('22222222-2222-2222-2222-222222222203', demo_profile_id, '11111111-1111-1111-1111-111111111102',
   'INV-PAYPAL-003', 'INV-2026-003', 450.00, 'USD', 'sent',
   '2026-10-05', '2026-09-05', 'API integration support', 'simulator'),

  ('22222222-2222-2222-2222-222222222204', demo_profile_id, '11111111-1111-1111-1111-111111111102',
   'INV-PAYPAL-004', 'INV-2026-004', 600.00, 'USD', 'sent',
   '2026-10-05', '2026-09-05', 'Dashboard development', 'simulator'),

  -- GreenLeaf – overdue
  ('22222222-2222-2222-2222-222222222205', demo_profile_id, '11111111-1111-1111-1111-111111111103',
   'INV-PAYPAL-005', 'INV-2026-005', 975.00, 'USD', 'overdue',
   '2026-09-20', '2026-08-20', 'Monthly retainer – September', 'simulator'),

  -- GreenLeaf – another overdue
  ('22222222-2222-2222-2222-222222222206', demo_profile_id, '11111111-1111-1111-1111-111111111103',
   'INV-PAYPAL-006', 'INV-2026-006', 975.00, 'USD', 'overdue',
   '2026-10-01', '2026-09-01', 'Monthly retainer – October', 'simulator'),

  -- Nova Media – open, unknown payer later
  ('22222222-2222-2222-2222-222222222207', demo_profile_id, '11111111-1111-1111-1111-111111111104',
   'INV-PAYPAL-007', 'INV-2026-007', 320.00, 'USD', 'sent',
   '2026-10-18', '2026-09-18', 'Social media graphics pack', 'simulator'),

  -- Extra open invoice for demo variety
  ('22222222-2222-2222-2222-222222222208', demo_profile_id, '11111111-1111-1111-1111-111111111101',
   'INV-PAYPAL-008', 'INV-2026-008', 2100.00, 'USD', 'sent',
   '2026-10-25', '2026-09-25', 'Full website rebuild', 'simulator');

  -- ============================================================
  -- TRANSACTIONS (messy real-world cases)
  -- ============================================================
  insert into public.transactions (
    id, profile_id, paypal_transaction_id, amount, fee_amount, net_amount,
    currency, status, type, payer_name, payer_email, client_id,
    transaction_date, source
  ) values
  -- 1. Exact match for INV-2026-001
  ('33333333-3333-3333-3333-333333333301', demo_profile_id, 'TXN-EXACT-001',
   1200.00, 34.80, 1165.20, 'USD', 'completed', 'payment',
   'Acme Design Studio', 'billing@acmedesign.co', '11111111-1111-1111-1111-111111111101',
   '2026-09-14 11:22:00+00', 'simulator'),

  -- 2. Partial payment for INV-2026-002 ($500 of $850)
  ('33333333-3333-3333-3333-333333333302', demo_profile_id, 'TXN-PARTIAL-002',
   500.00, 14.50, 485.50, 'USD', 'completed', 'payment',
   'Acme Design Studio', 'billing@acmedesign.co', '11111111-1111-1111-1111-111111111101',
   '2026-10-08 15:40:00+00', 'simulator'),

  -- 3. Bulk payment covering INV-2026-003 + INV-2026-004 ($450 + $600 = $1050)
  ('33333333-3333-3333-3333-333333333303', demo_profile_id, 'TXN-BULK-003',
   1050.00, 30.45, 1019.55, 'USD', 'completed', 'payment',
   'BrightTech Solutions', 'ap@brighttech.io', '11111111-1111-1111-1111-111111111102',
   '2026-10-06 09:15:00+00', 'simulator'),

  -- 4. Duplicate charge (same amount as a previous payment – anomaly)
  ('33333333-3333-3333-3333-333333333304', demo_profile_id, 'TXN-DUP-004',
   1200.00, 34.80, 1165.20, 'USD', 'completed', 'payment',
   'Acme Design Studio', 'billing@acmedesign.co', '11111111-1111-1111-1111-111111111101',
   '2026-09-14 11:25:00+00', 'simulator'),

  -- 5. Unknown payer (no client linked yet)
  ('33333333-3333-3333-3333-333333333305', demo_profile_id, 'TXN-UNKNOWN-005',
   320.00, 9.28, 310.72, 'USD', 'completed', 'payment',
   'N. Media LLC', 'payments@novamedia.tv', null,
   '2026-10-17 14:02:00+00', 'simulator'),

  -- 6. Fee spike example (unusually high fee)
  ('33333333-3333-3333-3333-333333333306', demo_profile_id, 'TXN-FEESPIKE-006',
   975.00, 78.00, 897.00, 'USD', 'completed', 'payment',
   'GreenLeaf Consulting', 'finance@greenleaf.com', '11111111-1111-1111-1111-111111111103',
   '2026-09-22 10:30:00+00', 'simulator'),

  -- 7. Small overpayment / tip style
  ('33333333-3333-3333-3333-333333333307', demo_profile_id, 'TXN-OVER-007',
   330.00, 9.57, 320.43, 'USD', 'completed', 'payment',
   'Nova Media', 'accounts@novamedia.tv', '11111111-1111-1111-1111-111111111104',
   '2026-10-19 16:45:00+00', 'simulator');

  -- ============================================================
  -- MATCHES (some already proposed / approved for demo)
  -- ============================================================
  insert into public.matches (
    id, transaction_id, invoice_id, amount_matched, match_type,
    confidence, reasoning, status, created_by
  ) values
  -- Exact match already approved
  ('44444444-4444-4444-4444-444444444401',
   '33333333-3333-3333-3333-333333333301',
   '22222222-2222-2222-2222-222222222201',
   1200.00, 'exact', 1.00,
   'Exact amount and client match. PayPal fee is within normal range.',
   'approved', 'agent'),

  -- Partial match proposed
  ('44444444-4444-4444-4444-444444444402',
   '33333333-3333-3333-3333-333333333302',
   '22222222-2222-2222-2222-222222222202',
   500.00, 'partial', 0.92,
   'Partial payment of $500 against $850 invoice. Remaining balance $350.',
   'proposed', 'agent'),

  -- Bulk match – first invoice
  ('44444444-4444-4444-4444-444444444403',
   '33333333-3333-3333-3333-333333333303',
   '22222222-2222-2222-2222-222222222203',
   450.00, 'bulk', 0.88,
   'Bulk payment of $1050 covers two open invoices from BrightTech ($450 + $600).',
   'proposed', 'agent'),

  -- Bulk match – second invoice
  ('44444444-4444-4444-4444-444444444404',
   '33333333-3333-3333-3333-333333333303',
   '22222222-2222-2222-2222-222222222204',
   600.00, 'bulk', 0.88,
   'Bulk payment of $1050 covers two open invoices from BrightTech ($450 + $600).',
   'proposed', 'agent');

  -- ============================================================
  -- ANNOTATIONS (categories + anomalies)
  -- ============================================================
  insert into public.annotations (
    entity_type, entity_id, category, anomaly_type, anomaly_reason, confidence, created_by
  ) values
  -- Categories
  ('transaction', '33333333-3333-3333-3333-333333333301', 'Brand Design', null, null, 0.95, 'agent'),
  ('transaction', '33333333-3333-3333-3333-333333333302', 'Web Design', null, null, 0.90, 'agent'),
  ('transaction', '33333333-3333-3333-3333-333333333303', 'Development', null, null, 0.87, 'agent'),

  -- Anomalies
  ('transaction', '33333333-3333-3333-3333-333333333304', null, 'duplicate',
   'Possible duplicate charge: same amount ($1200), same client, only 3 minutes after previous payment TXN-EXACT-001.',
   0.94, 'agent'),

  ('transaction', '33333333-3333-3333-3333-333333333306', null, 'fee_spike',
   'Fee of $78 (8.0%) is significantly higher than normal ~2.9% for this amount.',
   0.91, 'agent'),

  ('transaction', '33333333-3333-3333-3333-333333333305', 'Uncategorized', 'unknown_payer',
   'Payer name "N. Media LLC" does not exactly match any existing client. Closest match is Nova Media.',
   0.76, 'agent');

  -- ============================================================
  -- PENDING ACTIONS (Approval Queue – ready for demo)
  -- ============================================================
  insert into public.pending_actions (
    id, profile_id, action_type, payload, reasoning,
    related_transaction_id, related_invoice_id, status
  ) values
  -- 1. Send reminder for overdue GreenLeaf invoice
  ('55555555-5555-5555-5555-555555555501', demo_profile_id, 'send_reminder',
   jsonb_build_object(
     'invoice_id', '22222222-2222-2222-2222-222222222205',
     'client_email', 'finance@greenleaf.com',
     'subject', 'Friendly reminder: Invoice INV-2026-005 is overdue',
     'body', 'Hi GreenLeaf team, just a quick reminder that invoice INV-2026-005 for $975.00 was due on 20 Sep. Happy to resend the invoice or discuss payment options.'
   ),
   'Invoice is 30+ days overdue. Client has a history of late payments. Tone is polite but firm.',
   null, '22222222-2222-2222-2222-222222222205', 'pending'),

  -- 2. Send reminder for second overdue invoice
  ('55555555-5555-5555-5555-555555555502', demo_profile_id, 'send_reminder',
   jsonb_build_object(
     'invoice_id', '22222222-2222-2222-2222-222222222206',
     'client_email', 'finance@greenleaf.com',
     'subject', 'Reminder: October retainer invoice is now overdue',
     'body', 'Hi, the October retainer (INV-2026-006 – $975) is now past due. Please let me know if everything is okay on your side.'
   ),
   'Second consecutive overdue invoice from the same client.',
   null, '22222222-2222-2222-2222-222222222206', 'pending'),

  -- 3. Propose refund for the duplicate charge
  ('55555555-5555-5555-5555-555555555503', demo_profile_id, 'issue_refund',
   jsonb_build_object(
     'transaction_id', '33333333-3333-3333-3333-333333333304',
     'amount', 1200.00,
     'reason', 'Duplicate payment detected'
   ),
   'High confidence duplicate. Same client, same amount, 3 minutes apart. Recommend full refund after user confirmation.',
   '33333333-3333-3333-3333-333333333304', null, 'pending'),

  -- 4. Assign unknown payer to Nova Media
  ('55555555-5555-5555-5555-555555555504', demo_profile_id, 'assign_client',
   jsonb_build_object(
     'transaction_id', '33333333-3333-3333-3333-333333333305',
     'suggested_client_id', '11111111-1111-1111-1111-111111111104',
     'suggested_client_name', 'Nova Media'
   ),
   'Payer email domain and approximate name strongly suggest Nova Media. Confidence medium – needs human confirmation.',
   '33333333-3333-3333-3333-333333333305', null, 'pending');

  -- ============================================================
  -- AUDIT LOG (a few sample entries)
  -- ============================================================
  insert into public.audit_log (profile_id, action_type, entity_type, entity_id, details, performed_by, result)
  values
  (demo_profile_id, 'match_created', 'match', '44444444-4444-4444-4444-444444444401',
   '{"match_type":"exact","confidence":1.0}'::jsonb, 'agent', 'success'),

  (demo_profile_id, 'anomaly_flagged', 'transaction', '33333333-3333-3333-3333-333333333304',
   '{"anomaly_type":"duplicate"}'::jsonb, 'agent', 'success'),

  (demo_profile_id, 'reminder_proposed', 'pending_action', '55555555-5555-5555-5555-555555555501',
   '{"invoice":"INV-2026-005"}'::jsonb, 'agent', 'success');

end $$;

-- ============================================================
-- DONE
-- After running this script you should have:
--   • 1 demo profile
--   • 4 clients
--   • 8 invoices (mix of paid / partial / overdue / open)
--   • 7 transactions covering all messy cases
--   • 4 matches (1 approved + 3 proposed)
--   • 6 annotations (categories + anomalies)
--   • 4 pending actions ready for the approval queue
--   • A few audit log entries
-- ============================================================
