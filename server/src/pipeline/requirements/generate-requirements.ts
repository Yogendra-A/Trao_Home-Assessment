
import { extractRequirements } from "./extract";
import { generateStructuredJson } from "../llm/chat-completions";

export async function generateRequirements(jd: string) {
  return extractRequirements(jd, generateStructuredJson);
}
