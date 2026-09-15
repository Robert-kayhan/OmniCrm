import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/authenticate';
import { body, params, query } from '../../middleware/validate';
import { sendCreated, sendNoContent, sendSuccess } from '../../utils/response';
import type { IdParam } from '../../utils/validation';
import { auditContextFromRequest } from '../audit-logs/audit-log.service';
import * as customerService from './customer.service';
import type {
  CreateCustomerInput,
  CustomerTagParam,
  CustomerTagsInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from './customer.schema';

export async function listCustomersHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const result = await customerService.listCustomers(
    auth.organizationId,
    query<ListCustomersQuery>(req),
  );
  return sendSuccess(res, result.items, 200, result.meta);
}

export async function getCustomerHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  return sendSuccess(res, await customerService.getCustomerById(auth.organizationId, id));
}

export async function createCustomerHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const customer = await customerService.createCustomer(
    auth,
    body<CreateCustomerInput>(req),
    auditContextFromRequest(req),
  );
  return sendCreated(res, customer);
}

export async function updateCustomerHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  const customer = await customerService.updateCustomer(
    auth,
    id,
    body<UpdateCustomerInput>(req),
    auditContextFromRequest(req),
  );
  return sendSuccess(res, customer);
}

export async function deleteCustomerHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  await customerService.deleteCustomer(auth, id, auditContextFromRequest(req));
  return sendNoContent(res);
}

export async function addCustomerTagsHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  const customer = await customerService.addCustomerTags(auth, id, body<CustomerTagsInput>(req));
  return sendSuccess(res, customer);
}

export async function removeCustomerTagHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id, tagId } = params<CustomerTagParam>(req);
  return sendSuccess(res, await customerService.removeCustomerTag(auth, id, tagId));
}
