import { describe, expect, it } from 'vitest';
import { api, createCustomer, createWorkspace, db } from '../helpers/factories';

describe('POST /api/customers', () => {
  it('creates a customer scoped to the caller organization', async () => {
    const { admin } = await createWorkspace();

    const response = await api()
      .post('/api/customers')
      .set('Authorization', admin.auth)
      .send({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'Ada@Example.com',
        phone: '+1 555 0101',
        company: 'Analytical Engines',
        status: 'PROSPECT',
      })
      .expect(201);

    expect(response.body.data).toMatchObject({
      firstName: 'Ada',
      lastName: 'Lovelace',
      fullName: 'Ada Lovelace',
      // Emails are normalised to lower case so lookups are stable.
      email: 'ada@example.com',
      status: 'PROSPECT',
      organizationId: admin.organizationId,
    });
  });

  it('rejects a duplicate email inside the same organization', async () => {
    const { admin } = await createWorkspace();
    await createCustomer(admin.organizationId, { email: 'dup@test.local' });

    const response = await api()
      .post('/api/customers')
      .set('Authorization', admin.auth)
      .send({ firstName: 'Copy', email: 'dup@test.local' })
      .expect(409);

    expect(response.body.code).toBe('CUSTOMER_EMAIL_EXISTS');
  });

  it('allows the same email in a different organization', async () => {
    const alpha = await createWorkspace();
    const beta = await createWorkspace();
    await createCustomer(alpha.organization.id, { email: 'shared@test.local' });

    await api()
      .post('/api/customers')
      .set('Authorization', beta.admin.auth)
      .send({ firstName: 'Other', email: 'shared@test.local' })
      .expect(201);
  });

  it('rejects an invalid payload', async () => {
    const { admin } = await createWorkspace();

    const response = await api()
      .post('/api/customers')
      .set('Authorization', admin.auth)
      .send({ firstName: '', email: 'not-an-email' })
      .expect(422);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/customers', () => {
  it('paginates and reports totals', async () => {
    const { admin } = await createWorkspace();
    for (let index = 0; index < 5; index += 1) {
      await createCustomer(admin.organizationId, { firstName: `Person${index}` });
    }

    const response = await api()
      .get('/api/customers?page=1&limit=2')
      .set('Authorization', admin.auth)
      .expect(200);

    expect(response.body.data).toHaveLength(2);
    expect(response.body.meta).toMatchObject({ page: 1, limit: 2, total: 5, totalPages: 3 });
  });

  it('searches across name, email, phone and company', async () => {
    const { admin } = await createWorkspace();
    await createCustomer(admin.organizationId, {
      firstName: 'Zoya',
      lastName: 'Khan',
      company: 'Northwind',
      phone: '+44 20 7946 0000',
      email: 'zoya@northwind.test',
    });
    await createCustomer(admin.organizationId, { firstName: 'Other', company: 'Acme' });

    const byCompany = await api()
      .get('/api/customers?search=northwind')
      .set('Authorization', admin.auth)
      .expect(200);
    expect(byCompany.body.data).toHaveLength(1);
    expect(byCompany.body.data[0].firstName).toBe('Zoya');

    const byPhone = await api()
      .get('/api/customers?search=7946')
      .set('Authorization', admin.auth)
      .expect(200);
    expect(byPhone.body.data).toHaveLength(1);
  });

  it('filters by status', async () => {
    const { admin } = await createWorkspace();
    await createCustomer(admin.organizationId, { status: 'LEAD' });
    await createCustomer(admin.organizationId, { status: 'CUSTOMER' });

    const response = await api()
      .get('/api/customers?status=CUSTOMER')
      .set('Authorization', admin.auth)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].status).toBe('CUSTOMER');
  });
});

describe('DELETE /api/customers/:id', () => {
  it('removes the customer and cascades its conversations', async () => {
    const { admin, manager, organization } = await createWorkspace();
    const customer = await createCustomer(organization.id);
    await db().conversation.create({
      data: { organizationId: organization.id, customerId: customer.id, channel: 'WEBSITE' },
    });

    // Agents cannot delete; managers and above can.
    await api()
      .delete(`/api/customers/${customer.id}`)
      .set('Authorization', manager.auth)
      .expect(204);

    expect(await db().customer.findUnique({ where: { id: customer.id } })).toBeNull();
    expect(await db().conversation.count({ where: { customerId: customer.id } })).toBe(0);
    void admin;
  });
});
