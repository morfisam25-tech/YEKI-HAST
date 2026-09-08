import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LISTENER_TRAINING_MODULES,
  isListenerTrainingModule,
  listenerTrainingComplete,
} from '../services/api/src/domain/listener-onboarding.ts';

test('listener training modules cover the seven required blueprint areas', () => {
  assert.deepEqual(LISTENER_TRAINING_MODULES, [
    'role_boundary',
    'active_listening',
    'what_not_to_say',
    'platform_rules',
    'safety',
    'closing_conversation',
    'scenarios',
  ]);
});

test('listener training module validation rejects arbitrary values', () => {
  assert.equal(isListenerTrainingModule('safety'), true);
  assert.equal(isListenerTrainingModule('dating_tips'), false);
  assert.equal(isListenerTrainingModule(null), false);
});

test('listener training completes only when every required module is fully completed', () => {
  const complete = LISTENER_TRAINING_MODULES.map((module_key) => ({
    module_key,
    status: 'completed',
    progress_percent: 100,
  }));
  assert.equal(listenerTrainingComplete(complete), true);
  assert.equal(listenerTrainingComplete(complete.slice(0, 3)), false);
  assert.equal(listenerTrainingComplete([
    ...complete.slice(0, 3),
    { module_key: 'platform_rules', status: 'in_progress', progress_percent: 90 },
  ]), false);
});
