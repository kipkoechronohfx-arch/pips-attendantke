const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'test_secret_key';
const vipRoutes = require('../src/routes/vipRoutes');

// Mock the database
jest.mock('../src/services/db', () => ({
  getAppConfig: jest.fn().mockResolvedValue({ vipPassword: 'SUPER_SECRET_VIP_PASS' }),
  getPaymentByAccessCode: jest.fn().mockImplementation(async (code) => {
    if (code === 'VALID_CODE') return { plan: '1month', timestamp: Date.now() };
    if (code === 'EXPIRED_CODE') return { plan: '1month', timestamp: Date.now() - 40 * 24 * 60 * 60 * 1000 };
    return null;
  })
}));

// Setup express app for testing
const app = express();
app.use(express.json());
app.use('/api', vipRoutes);

describe('VIP Authentication Routes', () => {
  beforeAll(() => {
    // Set environment variable for JWT
    process.env.JWT_SECRET = 'test_secret_key';
  });

  describe('POST /api/verify-vip (Legacy global password)', () => {
    it('should return 400 if password is missing', async () => {
      const res = await request(app).post('/api/verify-vip').send({});
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    it('should return 401 if password is wrong', async () => {
      const res = await request(app).post('/api/verify-vip').send({ password: 'WRONG' });
      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });

    it('should return 200 and a JWT token if password is correct', async () => {
      const res = await request(app).post('/api/verify-vip').send({ password: 'SUPER_SECRET_VIP_PASS' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.sessionToken).toBeDefined();
      
      const decoded = jwt.verify(res.body.sessionToken, process.env.JWT_SECRET);
      expect(decoded.role).toBe('legacy_vip');
    });
  });

  describe('POST /api/verify-access-code (Payhero access codes)', () => {
    it('should return 401 for an invalid access code', async () => {
      const res = await request(app).post('/api/verify-access-code').send({ code: 'INVALID_XYZ' });
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Invalid access code/);
    });

    it('should return 401 for an expired access code', async () => {
      const res = await request(app).post('/api/verify-access-code').send({ code: 'EXPIRED_CODE' });
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/expired/);
    });

    it('should return 200 and a JWT for a valid active access code', async () => {
      const res = await request(app).post('/api/verify-access-code').send({ code: 'VALID_CODE' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.sessionToken).toBeDefined();
    });
  });
});
