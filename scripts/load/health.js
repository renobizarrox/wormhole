/**
 * k6 load test: health and readiness.
 * Run: k6 run scripts/load/health.js
 * Optionally: k6 run -e BASE_URL=http://localhost:3000 scripts/load/health.js
 * Requires k6: https://k6.io/docs/get-started/installation/
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/health`);
  check(res, { 'health status 200': (r) => r.status === 200 });
  check(res, { 'health body ok': (r) => JSON.parse(r.body).status === 'ok' });
  sleep(0.5);
}
