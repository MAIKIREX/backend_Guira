// Audit script v2: Find wallets using different approaches
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://culyqtrtuxznkedohryg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1bHlxdHJ0dXh6bmtlZG9ocnlnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDY0MDA4OSwiZXhwIjoyMDkwMjE2MDg5fQ.xpAtNmM4ekfLiyL65zwkh9Y3C9x0S7WAg98H_8JHPhM'
);

const USER_ID = '1bfaa092-4494-475d-998f-ccfdadbc106b';

async function audit() {
  console.log('═══ STEP 1: Try wallets table ═══');
  const { data: w1, error: e1 } = await supabase.from('wallets').select('*').eq('user_id', USER_ID);
  console.log('wallets:', w1?.length ?? 0, 'error:', e1?.message ?? 'none');
  if (w1?.length) console.log(JSON.stringify(w1, null, 2));

  console.log('\n═══ STEP 2: Try bridge_wallets table ═══');
  const { data: w2, error: e2 } = await supabase.from('bridge_wallets').select('*').eq('user_id', USER_ID);
  console.log('bridge_wallets:', w2?.length ?? 0, 'error:', e2?.message ?? 'none');
  if (w2?.length) console.log(JSON.stringify(w2, null, 2));

  console.log('\n═══ STEP 3: Check ALL ledger_entries for this user (via any wallet) ═══');
  // First try to get wallet IDs from any table
  let walletIds = [];
  
  // Try wallets
  if (w1?.length) walletIds = w1.map(w => w.id);
  // Try bridge_wallets
  if (w2?.length) walletIds = [...walletIds, ...w2.map(w => w.id)];

  if (walletIds.length === 0) {
    // Brute force: check if ledger_entries has any reference to this user
    // by looking at payment_orders linked to this user
    console.log('\n═══ STEP 4: Find payment_orders for this user ═══');
    const { data: orders, error: oErr } = await supabase
      .from('payment_orders')
      .select('id, wallet_id, flow_type, flow_category, amount, currency, status, created_at, destination_currency')
      .eq('user_id', USER_ID)
      .order('created_at', { ascending: false })
      .limit(20);
    
    console.log('payment_orders:', orders?.length ?? 0, 'error:', oErr?.message ?? 'none');
    if (orders?.length) {
      for (const o of orders) {
        console.log(`  ${o.created_at?.slice(0,19)} | ${o.flow_type?.padEnd(30)} | ${o.amount} ${o.currency} → ${o.destination_currency ?? '?'} | ${o.status} | wallet_id: ${o.wallet_id}`);
      }
      
      // Collect wallet_ids from orders
      const orderWalletIds = orders.filter(o => o.wallet_id).map(o => o.wallet_id);
      walletIds = [...new Set(orderWalletIds)];
      console.log('\nWallet IDs from orders:', walletIds);
    }
  }

  if (walletIds.length > 0) {
    console.log('\n═══ STEP 5: Get wallet details ═══');
    const { data: walletDetails } = await supabase
      .from('wallets')
      .select('*')
      .in('id', walletIds);
    console.log('Wallet details:', JSON.stringify(walletDetails, null, 2));

    console.log('\n═══ STEP 6: ALL ledger_entries (no date filter) ═══');
    const { data: allLedger, error: lErr } = await supabase
      .from('ledger_entries')
      .select('id, wallet_id, type, amount, currency, status, reference_type, reference_id, description, created_at')
      .in('wallet_id', walletIds)
      .order('created_at', { ascending: true });
    
    console.log('Total ledger entries:', allLedger?.length ?? 0, 'error:', lErr?.message ?? 'none');
    
    if (allLedger?.length) {
      // Group by month
      const byMonth = {};
      for (const e of allLedger) {
        const month = e.created_at.slice(0, 7); // YYYY-MM
        if (!byMonth[month]) byMonth[month] = [];
        byMonth[month].push(e);
      }

      for (const [month, entries] of Object.entries(byMonth)) {
        console.log(`\n──── ${month} (${entries.length} entries) ────`);
        for (const entry of entries) {
          console.log(`  [${entry.status?.toUpperCase().padEnd(8)}] ${entry.created_at.slice(0, 19)} | ${entry.type.padEnd(6)} | ${String(entry.amount).padStart(12)} ${(entry.currency || '?').padEnd(5)} | ${entry.description}`);
        }

        // Summary for this month
        const settled = entries.filter(e => e.status === 'settled');
        const pending = entries.filter(e => e.status === 'pending');
        const failed = entries.filter(e => e.status === 'failed');

        console.log(`\n  Summary for ${month}:`);
        console.log(`    Total: ${entries.length} (settled: ${settled.length}, pending: ${pending.length}, failed: ${failed.length})`);
        
        // By currency (settled only)
        const byCur = {};
        for (const e of settled) {
          const cur = e.currency || 'UNKNOWN';
          if (!byCur[cur]) byCur[cur] = { credits: 0, debits: 0, count: 0 };
          const amt = parseFloat(e.amount);
          if (e.type === 'credit') byCur[cur].credits += amt;
          else byCur[cur].debits += amt;
          byCur[cur].count++;
        }
        
        if (Object.keys(byCur).length) {
          console.log('    SETTLED breakdown by currency:');
          for (const [cur, d] of Object.entries(byCur)) {
            console.log(`      ${cur}: credits=${d.credits.toFixed(2)}, debits=${d.debits.toFixed(2)}, vol=${(d.credits+d.debits).toFixed(2)}, txns=${d.count}`);
          }
        }

        // By currency (ALL statuses)
        const byCurAll = {};
        for (const e of entries) {
          const cur = e.currency || 'UNKNOWN';
          if (!byCurAll[cur]) byCurAll[cur] = { credits: 0, debits: 0, count: 0 };
          const amt = parseFloat(e.amount);
          if (e.type === 'credit') byCurAll[cur].credits += amt;
          else byCurAll[cur].debits += amt;
          byCurAll[cur].count++;
        }
        console.log('    ALL STATUSES breakdown by currency:');
        for (const [cur, d] of Object.entries(byCurAll)) {
          console.log(`      ${cur}: credits=${d.credits.toFixed(2)}, debits=${d.debits.toFixed(2)}, vol=${(d.credits+d.debits).toFixed(2)}, txns=${d.count}`);
        }
      }
    }
  } else {
    console.log('\n⚠️ NO WALLET IDs FOUND AT ALL');
  }
}

audit().catch(console.error);
