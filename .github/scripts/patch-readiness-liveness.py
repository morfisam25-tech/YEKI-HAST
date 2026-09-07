from pathlib import Path

api_path = Path('api/index.ts')
api = api_path.read_text()

old_type = """        internet_voice_sweeper_ready: boolean;
        internet_voice_sweeper_ensure_ready: boolean;
        internet_voice_sweeper_stop_ready: boolean;
"""
new_type = """        internet_voice_sweeper_ready: boolean;
        internet_voice_sweeper_ensure_ready: boolean;
        internet_voice_sweeper_stop_ready: boolean;
        internet_voice_liveness_columns_ready: boolean;
        internet_voice_liveness_settlement_ready: boolean;
"""
if old_type not in api:
    raise SystemExit('readiness type target not found')
api = api.replace(old_type, new_type, 1)

old_select = """          to_regprocedure('app.sweep_internet_voice_sessions(integer)') IS NOT NULL AS internet_voice_sweeper_ready,
          to_regprocedure('app.ensure_internet_voice_sweeper_job()') IS NOT NULL AS internet_voice_sweeper_ensure_ready,
          to_regprocedure('app.stop_internet_voice_sweeper_if_idle()') IS NOT NULL AS internet_voice_sweeper_stop_ready
"""
new_select = """          to_regprocedure('app.sweep_internet_voice_sessions(integer)') IS NOT NULL AS internet_voice_sweeper_ready,
          to_regprocedure('app.ensure_internet_voice_sweeper_job()') IS NOT NULL AS internet_voice_sweeper_ensure_ready,
          to_regprocedure('app.stop_internet_voice_sweeper_if_idle()') IS NOT NULL AS internet_voice_sweeper_stop_ready,
          (
            SELECT count(*)=2
            FROM information_schema.columns
            WHERE table_schema='app'
              AND table_name='call_sessions'
              AND column_name IN ('caller_voice_heartbeat_at','listener_voice_heartbeat_at')
          ) AS internet_voice_liveness_columns_ready,
          to_regprocedure('app.settle_internet_voice_call(uuid,text,text,boolean,timestamptz)') IS NOT NULL
            AS internet_voice_liveness_settlement_ready
"""
if old_select not in api:
    raise SystemExit('readiness SQL target not found')
api = api.replace(old_select, new_select, 1)

old_ready = """        && row?.internet_voice_sweeper_ready
        && row?.internet_voice_sweeper_ensure_ready
        && row?.internet_voice_sweeper_stop_ready
"""
new_ready = """        && row?.internet_voice_sweeper_ready
        && row?.internet_voice_sweeper_ensure_ready
        && row?.internet_voice_sweeper_stop_ready
        && row?.internet_voice_liveness_columns_ready
        && row?.internet_voice_liveness_settlement_ready
"""
if old_ready not in api:
    raise SystemExit('relationsReady target not found')
api = api.replace(old_ready, new_ready, 1)

old_log = """          internetVoiceSweeper: Boolean(row?.internet_voice_sweeper_ready),
          internetVoiceSweeperEnsure: Boolean(row?.internet_voice_sweeper_ensure_ready),
          internetVoiceSweeperStop: Boolean(row?.internet_voice_sweeper_stop_ready),
"""
new_log = """          internetVoiceSweeper: Boolean(row?.internet_voice_sweeper_ready),
          internetVoiceSweeperEnsure: Boolean(row?.internet_voice_sweeper_ensure_ready),
          internetVoiceSweeperStop: Boolean(row?.internet_voice_sweeper_stop_ready),
          internetVoiceLivenessColumns: Boolean(row?.internet_voice_liveness_columns_ready),
          internetVoiceLivenessSettlement: Boolean(row?.internet_voice_liveness_settlement_ready),
"""
if old_log not in api:
    raise SystemExit('readiness log target not found')
api_path.write_text(api.replace(old_log, new_log, 1))

test_path = Path('tests/internet-voice-liveness.test.ts')
test = test_path.read_text()
anchor = """test('readiness pins the exact liveness-aware migration bytes', () => {
"""
new_test = """test('readiness fails closed if liveness columns or effective-end settlement are absent', () => {
  assert.match(ready, /caller_voice_heartbeat_at','listener_voice_heartbeat_at/);
  assert.match(ready, /internet_voice_liveness_columns_ready/);
  assert.match(ready, /settle_internet_voice_call\\(uuid,text,text,boolean,timestamptz\\)/);
  assert.match(ready, /internet_voice_liveness_settlement_ready/);
  assert.match(ready, /row\\?\\.internet_voice_liveness_columns_ready/);
  assert.match(ready, /row\\?\\.internet_voice_liveness_settlement_ready/);
});

""" + anchor
if anchor not in test:
    raise SystemExit('liveness test anchor not found')
test_path.write_text(test.replace(anchor, new_test, 1))
