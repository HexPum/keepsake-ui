import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pdfFixturePath = path.join(__dirname, "..", "fixtures", "test.pdf");
const pdfContent = fs.readFileSync(pdfFixturePath);

export function createTestPdfFile(fileName = "test.pdf"): File {
  return new File([pdfContent], fileName, {
    type: "application/pdf",
  });
}
