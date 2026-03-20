import type { Prediction, InsuranceInfo, PredictionStore } from './types.js';

/**
 * In-memory store for off-chain prediction data.
 * The on-chain contract only stores the hash — full details live here.
 * In production this would be backed by a database.
 */
class Store implements PredictionStore {
  predictions: Map<number, Prediction> = new Map();
  insurance: Map<number, InsuranceInfo[]> = new Map();

  addPrediction(prediction: Prediction): void {
    this.predictions.set(prediction.id, prediction);
    console.log('[STORE] Stored prediction', prediction.id, '-', prediction.asset, prediction.direction);
  }

  getPrediction(id: number): Prediction | undefined {
    return this.predictions.get(id);
  }

  getActivePredictions(): Prediction[] {
    const now = Math.floor(Date.now() / 1000);
    return Array.from(this.predictions.values()).filter(
      (p) => !p.resolved && p.expiresAt > now,
    );
  }

  getExpiredUnresolved(): Prediction[] {
    const now = Math.floor(Date.now() / 1000);
    return Array.from(this.predictions.values()).filter(
      (p) => !p.resolved && p.expiresAt <= now,
    );
  }

  getAllPredictions(): Prediction[] {
    return Array.from(this.predictions.values());
  }

  resolvePrediction(id: number, correct: boolean): void {
    const prediction = this.predictions.get(id);
    if (prediction) {
      prediction.resolved = true;
      prediction.correct = correct;
      console.log('[STORE] Resolved prediction', id, 'correct:', correct);
    }
  }

  addInsurance(info: InsuranceInfo): void {
    const existing = this.insurance.get(info.predictionId) || [];
    existing.push(info);
    this.insurance.set(info.predictionId, existing);
    console.log('[STORE] Insurance recorded for prediction', info.predictionId);
  }

  getInsurance(predictionId: number): InsuranceInfo[] {
    return this.insurance.get(predictionId) || [];
  }
}

// Singleton
export const store = new Store();
