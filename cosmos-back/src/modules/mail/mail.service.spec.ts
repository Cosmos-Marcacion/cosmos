import { MailService } from './mail.service'

interface Correo {
  to: string
  subject: string
}

// nodemailer no trae tipos en el proyecto: se sustituye entero por una fabrica
// propia, asi el test no toca nada sin tipar.
const mockSendMail = jest.fn<Promise<unknown>, [Correo]>()
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: mockSendMail }),
}))

describe('MailService', () => {
  beforeEach(() => {
    mockSendMail.mockResolvedValue({})
    delete process.env.MAIL_REDIRECT_TO
  })

  afterAll(() => {
    delete process.env.MAIL_REDIRECT_TO
  })

  it('envia el codigo al destinatario', async () => {
    await new MailService().sendPasswordResetCode({ toEmail: 'ana@cosmos.com.pe', code: '123456' })

    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ana@cosmos.com.pe' }))
  })

  it('con MAIL_REDIRECT_TO no escribe al usuario real', async () => {
    // QA trabaja con una copia de los usuarios de produccion.
    process.env.MAIL_REDIRECT_TO = 'soporte@cosmos.com.pe'

    await new MailService().sendPasswordResetCode({ toEmail: 'ana@cosmos.com.pe', code: '123456' })

    const [correo] = mockSendMail.mock.calls[0]
    expect(correo.to).toBe('soporte@cosmos.com.pe')
    expect(correo.subject).toContain('[QA para ana@cosmos.com.pe]')
  })
})
