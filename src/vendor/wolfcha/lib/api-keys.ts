// Adapted from oil-oil/wolfcha for Meolord; see src/vendor/wolfcha/UPSTREAM.md.
import { GENERATOR_MODEL, REVIEW_MODEL, SUMMARY_MODEL } from "../types/game";

// The embedded game uses the site's two server-configured models only.
export type ModelSource = "project";

export function getModelSource(): ModelSource {
  return "project";
}

export function getGeneratorModel(): string {
  return GENERATOR_MODEL;
}

export function getSummaryModel(): string {
  return SUMMARY_MODEL;
}

export function getReviewModel(): string {
  return REVIEW_MODEL;
}
