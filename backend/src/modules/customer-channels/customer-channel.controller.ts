import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/authenticate';
import { body, params } from '../../middleware/validate';
import { sendCreated, sendNoContent, sendSuccess } from '../../utils/response';
import type { IdParam } from '../../utils/validation';
import * as service from './customer-channel.service';
import type {
  CreateCustomerChannelInput,
  CustomerChannelParam,
} from './customer-channel.schema';

export async function listCustomerChannelsHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  return sendSuccess(res, await service.listCustomerChannels(auth.organizationId, id));
}

export async function createCustomerChannelHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  const created = await service.createCustomerChannel(
    auth,
    id,
    body<CreateCustomerChannelInput>(req),
  );
  return sendCreated(res, created);
}

export async function deleteCustomerChannelHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id, channelId } = params<CustomerChannelParam>(req);
  await service.deleteCustomerChannel(auth, id, channelId);
  return sendNoContent(res);
}
