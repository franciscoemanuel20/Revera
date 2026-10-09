// Executar com módulo PGlite instalado fora do checkout: node script /caminho/do/modulo
const {PGlite}=require(process.argv[2]||'@electric-sql/pglite');const fs=require('fs');const assert=require('assert/strict');
(async()=>{const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;
create table orders(id uuid primary key,customer_id uuid,payment_status text,canceled_at timestamptz);
create table customers(id uuid primary key,email text);
create table order_notifications(id uuid primary key default gen_random_uuid(),order_id uuid,kind text,channel text,sent_at timestamptz,provider_message_id text,last_error text,attempts int default 0,created_at timestamptz default now(),unique(order_id,kind));`);
await db.exec(`insert into order_notifications(order_id,kind,channel,attempts) values('00000000-0000-0000-0000-000000000099','confirmacao_cliente','email',0)`);
await db.exec(fs.readFileSync('supabase/migrations/00000000000043_durable_customer_confirmation.sql','utf8'));
assert.equal((await db.query('select confirmation_review_required from order_notifications')).rows[0].confirmation_review_required,true);
assert.equal((await db.query(`select * from claim_paid_confirmation('00000000-0000-0000-0000-000000000099','{}')`)).rows.length,0);
await db.exec('truncate order_notifications');
// O emissor legado pode inserir depois da migration, durante deploy/rollback.
const legacy='00000000-0000-0000-0000-000000000098';
await db.exec(`insert into orders(id,payment_status) values('${legacy}','paid');insert into order_notifications(order_id,kind,channel) values('${legacy}','confirmacao_cliente','email')`);
assert.equal((await db.query(`select confirmation_review_required from order_notifications where order_id='${legacy}'`)).rows[0].confirmation_review_required,true);
assert.equal((await db.query(`select * from claim_paid_confirmation('${legacy}','{}')`)).rows.length,0);
await db.exec('truncate order_notifications');
const id='00000000-0000-0000-0000-000000000002';await db.exec(`insert into customers values('00000000-0000-0000-0000-000000000001','test@example.invalid');insert into orders values('${id}','00000000-0000-0000-0000-000000000001','paid',null);select reserve_paid_confirmations(null);`);
const claim=()=>db.query(`select * from claim_paid_confirmation('${id}','{"body":"test"}')`);
const finish=(lease,sent=false,definite=false)=>db.query(`select finish_paid_confirmation('${id}',$1,$2,'isolated','simulated',$3) result`,[lease,sent,definite]);
const reset=()=>db.exec('update order_notifications set confirmation_next_attempt_at=now()-interval \'1 minute\'');
const [a,b]=await Promise.all([claim(),claim()]);assert.equal(a.rows.length+b.rows.length,1);const lease=(a.rows[0]||b.rows[0]).lease;
assert.equal((await finish('00000000-0000-0000-0000-000000000000',true)).rows[0].result,false);
// Timeout après aceite simulado, seguido de429: preserve o relógio original.
await finish(lease,false,false);await reset();const second=await claim();const first=(await db.query('select confirmation_first_attempt_at from order_notifications')).rows[0].confirmation_first_attempt_at;
await finish(second.rows[0].lease,false,true);assert.equal(new Date((await db.query('select confirmation_first_attempt_at from order_notifications')).rows[0].confirmation_first_attempt_at).getTime(),new Date(first).getTime());
await db.exec("update order_notifications set confirmation_first_attempt_at=now()-interval '25 hours',confirmation_next_attempt_at=now()-interval '1 minute'");assert.equal((await claim()).rows.length,0);assert.equal((await db.query('select confirmation_review_required from order_notifications')).rows[0].confirmation_review_required,true);
// Novo cenário: falhas seguramente recusadas não esgotam a intenção.
await db.exec('truncate order_notifications');await db.exec('select reserve_paid_confirmations(null)');const fresh=await claim();await finish(fresh.rows[0].lease,false,true);assert.equal((await db.query('select confirmation_payload from order_notifications')).rows[0].confirmation_payload,null);await db.exec("update order_notifications set attempts=8,created_at=now()-interval '4 days',confirmation_next_attempt_at=now()-interval '1 minute'");assert.equal((await claim()).rows.length,1);
await db.exec('truncate order_notifications');await db.exec(`select reserve_paid_confirmations(null);insert into orders select gen_random_uuid(),'00000000-0000-0000-0000-000000000001','paid',now() from generate_series(1,10);insert into order_notifications(order_id,kind,channel,confirmation_next_attempt_at) select id,'confirmacao_cliente','email',now()-interval '1 day' from orders where canceled_at is not null;`);assert.deepEqual((await db.query('select * from paid_confirmation_candidates()')).rows.map(r=>r.order_id),[id]);
await db.exec('set role authenticated');let denied=false;try{await db.exec('select reserve_paid_confirmations(null)')}catch{denied=true}assert(denied);
console.log(JSON.stringify({sqlMigrationPassed:true,exclusiveClaims:true,staleLeaseCannotFinalize:true,timeoutThen429PreservesFirstAttempt:true,uncertainAfter25hRequiresReview:true,eightFailuresFourDaysRecoverable:true,tenCanceledDoNotStarvePaid:true,authenticatedCannotInvoke:true}));await db.close();})().catch(e=>{console.error(e.message);process.exitCode=1;});
