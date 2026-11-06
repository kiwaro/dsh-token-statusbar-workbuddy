const diagnosticTimes = new Map();
export function reportDiagnostic(operation, error) {
 const now = Date.now();
 if (now - (diagnosticTimes.get(operation) ?? -Infinity) < 60000) return;
 diagnosticTimes.set(operation, now);
 const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'FAILED';
 console.warn(`[dsh-token-statusbar-workbuddy] ${operation}: ${code}`);
}
