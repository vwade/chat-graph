import { detectImporter } from './detectImporter';
import type { ImportPreview } from './types';

export function buildImportPreview(data: unknown, file_name: string): ImportPreview {
	return detectImporter(data, file_name).preview;
}
