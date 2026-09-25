// scripts/eval/run.mjs — chay 4 bo golden theo `sets` da loc (H08 §10, Đ29).
// Tach khoi scripts/eval_golden.mjs de MOT ham DUY NHAT dung chung boi CLI
// that (scripts/eval_golden.mjs) va kich ban RED (scripts/eval/
// red-fake-model.mjs), va de test (scripts/eval/set-flag.test.mjs) goi truc
// tiep voi cac ham cham GIA (spy) — chung minh "--set diagnosis,
// responsibility khong goi bo khac" ma KHONG can DB. `scorers` cho phep tiem
// ham cham GIA cho test; CLI that KHONG truyen `scorers` (dung ham that tu
// score.mjs).

import { shouldRun } from './args.mjs';
import {
  scoreEmergencySet as realScoreEmergencySet,
  scoreConsentSet as realScoreConsentSet,
  scoreDiagnosisSet as realScoreDiagnosisSet,
  scoreResponsibilitySet as realScoreResponsibilitySet,
} from './score.mjs';

function printFailures(failures, log, limit = 20) {
  for (const f of failures.slice(0, limit)) log(`  - ${f}`);
  if (failures.length > limit) log(`  - ... va ${failures.length - limit} ca khac`);
}

/**
 * Chay cac bo trong `sets` (null = ca 4, hanh vi cu). Tra ve `results` — CHI
 * cac key da chay (bo `skipped` KHONG co mat trong object nay, nen
 * `decideExit` tu dong bo qua — H08 §10 dong 1). In dong
 * "<ten>: skipped (--set)" cho bo khong chay.
 */
export async function runSelectedSets({
  sets,
  emergencyDeps,
  consentDeps,
  agentDeps,
  cases,
  triageEmergencyMin,
  log = console.log,
  scorers = {},
}) {
  const scoreEmergencySet = scorers.scoreEmergencySet ?? realScoreEmergencySet;
  const scoreConsentSet = scorers.scoreConsentSet ?? realScoreConsentSet;
  const scoreDiagnosisSet = scorers.scoreDiagnosisSet ?? realScoreDiagnosisSet;
  const scoreResponsibilitySet = scorers.scoreResponsibilitySet ?? realScoreResponsibilitySet;

  const results = {};

  if (shouldRun(sets, 'emergency')) {
    const emergency = await scoreEmergencySet(emergencyDeps, cases.emergency, triageEmergencyMin);
    log(
      `emergency: total=${emergency.total} pass=${emergency.pass} layer1_hits=${emergency.layer1Hits} ` +
        `layer2_calls=${emergency.layer2Calls} layer2_hits=${emergency.layer2Hits} ` +
        `false_positive=${emergency.falsePositive} (${(emergency.falsePositiveRate * 100).toFixed(1)}%) ` +
        `false_negative=${emergency.falseNegative} ok=${emergency.ok}`
    );
    printFailures(emergency.failures, log);
    results.emergency = emergency;
  } else {
    log('emergency: skipped (--set)');
  }

  if (shouldRun(sets, 'consent')) {
    const consent = await scoreConsentSet(consentDeps, cases.consent);
    log(
      `consent: total=${consent.total} pass=${consent.pass} false_accept=${consent.falseAccept} ` +
        `recall=${(consent.recall * 100).toFixed(1)}% ok=${consent.ok}`
    );
    printFailures(consent.failures, log);
    results.consent = consent;
  } else {
    log('consent: skipped (--set)');
  }

  if (shouldRun(sets, 'diagnosis')) {
    const diagnosis = await scoreDiagnosisSet(agentDeps, cases.diagnosis);
    if (diagnosis.blocked) {
      log(`diagnosis: blocked (${diagnosis.reason})`);
    } else {
      log(
        `diagnosis: total=${diagnosis.total} scored=${diagnosis.scored} pass=${diagnosis.pass} ` +
          `rate=${(diagnosis.rate * 100).toFixed(1)}% avg_questions=${diagnosis.avgQuestions.toFixed(2)} ` +
          `blocked=${diagnosis.blockedCount} ok=${diagnosis.ok}`
      );
      printFailures(diagnosis.failures, log);
    }
    results.diagnosis = diagnosis;
  } else {
    log('diagnosis: skipped (--set)');
  }

  if (shouldRun(sets, 'responsibility')) {
    const responsibility = await scoreResponsibilitySet(agentDeps, cases.responsibility);
    if (responsibility.blocked) {
      log(`responsibility: blocked (${responsibility.reason})`);
    } else {
      log(
        `responsibility: total=${responsibility.total} scored=${responsibility.scored} pass=${responsibility.pass} ` +
          `rate=${(responsibility.rate * 100).toFixed(1)}% citation_ok=${responsibility.citationOk}/${responsibility.citationChecked} ` +
          `blocked=${responsibility.blockedCount} ok=${responsibility.ok}`
      );
      printFailures(responsibility.failures, log);
    }
    results.responsibility = responsibility;
  } else {
    log('responsibility: skipped (--set)');
  }

  return results;
}
