import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createActivationService } from './activationService.js';

const installationId = '8a73e54e-c33f-40ca-a2dc-06626851744d';
const storage = {
  getInstallationId: vi.fn(),
  readAuthorization: vi.fn(),
  saveAuthorization: vi.fn(),
  clearAuthorization: vi.fn(),
};
const api = { activate: vi.fn() };
const service = createActivationService(storage, api);
beforeEach(() => {
  vi.resetAllMocks();
  storage.getInstallationId.mockResolvedValue(installationId);
});
describe('extension activation service', () => {
  it('reports Not activated without authorization', async () => {
    expect(await service.getState()).toEqual({
      installationId,
      activated: false,
    });
  });
  it('reports Activated for a locally valid stored token', async () => {
    storage.readAuthorization.mockResolvedValue({ accessToken: 'fake' });
    expect(await service.getState()).toEqual({
      installationId,
      activated: true,
    });
  });
  it('normalizes input, calls API and awaits token storage', async () => {
    const response = { accessToken: 'fake', installationId };
    api.activate.mockResolvedValue(response);
    expect(await service.activate(' abcd-efgh ')).toEqual({
      installationId,
      activated: true,
    });
    expect(api.activate).toHaveBeenCalledWith({
      activationCode: 'ABCD-EFGH',
      installationId,
    });
    expect(storage.saveAuthorization).toHaveBeenCalledWith(
      response,
      installationId,
    );
  });
  it.each(['', 'short'])(
    'rejects invalid input without fetching',
    async (code) => {
      await expect(service.activate(code)).rejects.toMatchObject({
        code: 'INVALID_REQUEST',
      });
      expect(api.activate).not.toHaveBeenCalled();
    },
  );
  it('does not persist unsuccessful responses', async () => {
    api.activate.mockRejectedValue(new Error('failed'));
    await expect(service.activate('ABCD-EFGH')).rejects.toThrow();
    expect(storage.saveAuthorization).not.toHaveBeenCalled();
  });
  it('does not claim activation when token storage fails', async () => {
    api.activate.mockResolvedValue({});
    storage.saveAuthorization.mockRejectedValue(new Error('quota'));
    await expect(service.activate('ABCD-EFGH')).rejects.toThrow();
  });
});
