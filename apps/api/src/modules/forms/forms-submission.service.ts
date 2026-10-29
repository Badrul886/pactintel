import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { FormsRepository, ListSubmissionsOptions } from './forms.repository';
import { FormsRoutingService } from './forms-routing.service';
import { FormsMagicLinkService } from './forms-magic-link.service';
import {
  FormFieldDefinition,
  FormDefinition,
  FormSettings,
  FormRoleDefinition,
} from '@pactintel/shared-types';

@Injectable()
export class FormsSubmissionService {
  private readonly logger = new Logger(FormsSubmissionService.name);

  // In-memory fallback sliding-window rate limiter (10 submissions per minute per IP)
  private readonly rateLimits = new Map<string, { count: number; windowStart: number }>();
  private static readonly RATE_LIMIT_WINDOW_MS = 60000;
  private static readonly RATE_LIMIT_MAX = 10;

  constructor(
    private readonly formsRepo: FormsRepository,
    private readonly routingService: FormsRoutingService,
    private readonly magicLinkService: FormsMagicLinkService,
  ) {}

  /**
   * Rate limits public form submissions per IP (EC-FORM-03).
   * 10 requests per 60 seconds.
   */
  async checkRateLimit(ip: string): Promise<void> {
    const now = Date.now();
    const entry = this.rateLimits.get(ip) || { count: 0, windowStart: now };

    if (now - entry.windowStart > FormsSubmissionService.RATE_LIMIT_WINDOW_MS) {
      entry.count = 1;
      entry.windowStart = now;
    } else {
      entry.count += 1;
    }

    this.rateLimits.set(ip, entry);

    if (entry.count > FormsSubmissionService.RATE_LIMIT_MAX) {
      this.logger.warn(`Rate limit exceeded for IP: ${ip}`);
      throw new HttpException(
        'Too Many Requests: Rate limit exceeded (10 submissions/min).',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Evaluates conditional logic to determine if a field should be shown (EC-FORM-09).
   */
  isFieldVisible(field: FormFieldDefinition, answers: Record<string, unknown>): boolean {
    if (!field.dependsOn) {
      return true;
    }

    const { fieldId, operator, value } = field.dependsOn;
    const parentValue = answers[fieldId];

    switch (operator) {
      case 'equals':
        return String(parentValue) === String(value);
      case 'not_equals':
        return String(parentValue) !== String(value);
      case 'contains':
        return (
          typeof parentValue === 'string' &&
          parentValue.toLowerCase().includes(String(value).toLowerCase())
        );
      case 'greater_than':
        return Number(parentValue) > Number(value);
      case 'less_than':
        return Number(parentValue) < Number(value);
      default:
        return true;
    }
  }

  /**
   * Validates submitted answers against the form field definitions.
   * Prunes hidden conditional fields and validates types, required, regex, bounds (EC-FORM-08).
   */
  validateAndPruneAnswers(
    definition: FormDefinition,
    rawAnswers: Record<string, unknown>,
    allowedFieldIds?: string[],
  ): Record<string, unknown> {
    const validAnswers: Record<string, unknown> = {};
    const allFields: FormFieldDefinition[] = [];

    if (definition?.sections) {
      for (const section of definition.sections) {
        if (section.fields) {
          allFields.push(...section.fields);
        }
      }
    }

    for (const field of allFields) {
      // If scoped to a specific role, ignore other fields
      if (allowedFieldIds && !allowedFieldIds.includes(field.id)) {
        continue;
      }

      // Check conditional visibility
      const isVisible = this.isFieldVisible(field, rawAnswers);
      if (!isVisible) {
        // Field is conditionally hidden: skip validation and do not store
        continue;
      }

      const val = rawAnswers[field.id];

      // Required validation
      if (
        field.required &&
        (val === undefined ||
          val === null ||
          val === '' ||
          (Array.isArray(val) && val.length === 0))
      ) {
        throw new BadRequestException({
          code: 'FIELD_REQUIRED',
          message: `Field "${field.label}" is required.`,
          fieldId: field.id,
        });
      }

      if (val !== undefined && val !== null && val !== '') {
        // Email type validation
        if (field.type === 'email') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (typeof val !== 'string' || !emailRegex.test(val.trim())) {
            throw new BadRequestException({
              code: 'INVALID_EMAIL',
              message: `Field "${field.label}" must be a valid email address.`,
              fieldId: field.id,
            });
          }
        }

        // Number bounds validation
        if (field.type === 'number') {
          const num = Number(val);
          if (isNaN(num)) {
            throw new BadRequestException({
              code: 'INVALID_NUMBER',
              message: `Field "${field.label}" must be a number.`,
              fieldId: field.id,
            });
          }
          if (field.min !== undefined && num < field.min) {
            throw new BadRequestException({
              code: 'NUMBER_TOO_SMALL',
              message: `Field "${field.label}" must be at least ${field.min}.`,
              fieldId: field.id,
            });
          }
          if (field.max !== undefined && num > field.max) {
            throw new BadRequestException({
              code: 'NUMBER_TOO_LARGE',
              message: `Field "${field.label}" cannot exceed ${field.max}.`,
              fieldId: field.id,
            });
          }
        }

        // Regex pattern validation
        if (field.pattern && typeof val === 'string') {
          try {
            const regex = new RegExp(field.pattern);
            if (!regex.test(val)) {
              throw new BadRequestException({
                code: 'PATTERN_MISMATCH',
                message: `Field "${field.label}" does not match the required format.`,
                fieldId: field.id,
              });
            }
          } catch (e: any) {
            if (e instanceof BadRequestException) throw e;
          }
        }

        // Options check for dropdown & radio
        if ((field.type === 'dropdown' || field.type === 'radio') && field.options) {
          if (!field.options.includes(String(val))) {
            throw new BadRequestException({
              code: 'INVALID_OPTION',
              message: `Selected option for "${field.label}" is invalid.`,
              fieldId: field.id,
            });
          }
        }

        validAnswers[field.id] = val;
      }
    }

    return validAnswers;
  }

  /**
   * Public Form Submission Engine (Role 0 submit).
   * Validates form status, limits, email uniqueness, schema, and initiates role progression.
   */
  async submitForm(params: {
    formId: string;
    submitterIp: string;
    submitterEmail?: string;
    rawAnswers: Record<string, unknown>;
  }) {
    // 1. IP Rate Limiting (EC-FORM-03)
    await this.checkRateLimit(params.submitterIp);

    // 2. Fetch Form
    const form = await this.formsRepo.findFormById('', params.formId);
    if (!form) {
      throw new NotFoundException({
        code: 'FORM_NOT_FOUND',
        message: 'Form not found.',
      });
    }

    // 3. Status Check (EC-FORM-04)
    if (form.status !== 'published') {
      throw new ForbiddenException({
        code: 'FORM_CLOSED',
        message: 'This form is currently closed to submissions.',
      });
    }

    const settings = (form.settings || {}) as FormSettings;

    // 4. Close Date Check (EC-FORM-05)
    if (settings.closeDate) {
      const closeDate = new Date(settings.closeDate);
      if (new Date() > closeDate) {
        await this.formsRepo.updateForm(form.organizationId, form.id, { status: 'closed' });
        throw new ForbiddenException({
          code: 'FORM_CLOSED',
          message: 'The submission deadline for this form has passed.',
        });
      }
    }

    // 5. Submission Limit Check (EC-FORM-06)
    if (settings.submissionLimit !== undefined && settings.submissionLimit > 0) {
      const completedCount = await this.formsRepo.countCompletedSubmissions(form.id);
      if (completedCount >= settings.submissionLimit) {
        await this.formsRepo.updateForm(form.organizationId, form.id, { status: 'closed' });
        throw new BadRequestException({
          code: 'SUBMISSION_LIMIT_EXCEEDED',
          message: 'This form has reached its maximum submission limit.',
        });
      }
    }

    // 6. One Response Per Email Check (EC-FORM-07)
    const email = params.submitterEmail || (params.rawAnswers['email'] as string);
    if (settings.oneResponsePerEmail && email) {
      const existing = await this.formsRepo.findSubmissionByEmail(form.id, email);
      if (existing) {
        throw new ConflictException({
          code: 'DUPLICATE_SUBMISSION',
          message: 'A submission from this email address has already been recorded.',
        });
      }
    }

    // 7. Validate & Prune Answers
    const roles: FormRoleDefinition[] = ((form.roles as any) || []).sort(
      (a: any, b: any) => a.sortOrder - b.sortOrder,
    );
    const role0Fields = roles.length > 0 ? roles[0].fields : undefined;

    const validatedAnswers = this.validateAndPruneAnswers(
      form.definition as any,
      params.rawAnswers,
      role0Fields,
    );

    // 8. Create Initial Submission Record
    const isMultiRole = roles.length > 1;
    const initialStatus = isMultiRole ? 'partial' : 'complete';
    const initialRole = isMultiRole ? roles[0].roleName : null;

    const submission = await this.formsRepo.createSubmission({
      organizationId: form.organizationId,
      formId: form.id,
      formVersion: form.version,
      submitterEmail: email,
      submitterIp: params.submitterIp,
      data: validatedAnswers,
      status: initialStatus,
      currentRole: initialRole,
      submittedAt: !isMultiRole ? new Date() : null,
    });

    // 9. Advance Role (If Multi-Role) or Execute Post-Completion
    if (isMultiRole) {
      const advanceResult = await this.routingService.advanceRole({
        organizationId: form.organizationId,
        form: {
          id: form.id,
          name: form.name,
          slug: form.slug,
          roles,
          definition: form.definition,
        },
        submission: {
          id: submission.id,
          currentRole: initialRole,
          data: validatedAnswers,
          submitterEmail: email,
        },
        newAnswers: {},
      });

      return {
        submissionId: submission.id,
        status: 'partial',
        nextRole: advanceResult.nextRole,
        message: 'Your response has been submitted and forwarded for review.',
        successPage: settings.successPage,
      };
    } else {
      // Evaluate routing rules for single-role
      const rules = (form.definition as any)?.routingRules || [];
      await this.routingService.evaluateRoutingRules(
        form.organizationId,
        rules,
        validatedAnswers,
        form.name,
      );

      return {
        submissionId: submission.id,
        status: 'complete',
        message: 'Thank you! Your response has been submitted successfully.',
        successPage: settings.successPage,
      };
    }
  }

  /**
   * Continues a multi-role submission via a magic link (Role N submit).
   */
  async submitContinued(rawToken: string, answers: Record<string, unknown>) {
    // 1. Validate Token (throws 401 if expired or used)
    const magicLink = await this.magicLinkService.validateMagicLink(rawToken);
    const form = magicLink.form;
    const submission = magicLink.submission;

    // 2. Validate Answers against current role fields
    const roles: FormRoleDefinition[] = ((form.roles as any) || []).sort(
      (a: any, b: any) => a.sortOrder - b.sortOrder,
    );
    const currentRoleConfig = roles.find((r) => r.roleName === magicLink.roleName);
    const allowedFieldIds = currentRoleConfig?.fields;

    const validatedAnswers = this.validateAndPruneAnswers(
      form.definition as any,
      answers,
      allowedFieldIds,
    );

    // 3. Mark Token Used
    await this.magicLinkService.markUsed(magicLink.id);

    // 4. Advance Role
    const advanceResult = await this.routingService.advanceRole({
      organizationId: form.organizationId,
      form: {
        id: form.id,
        name: form.name,
        slug: form.slug,
        roles,
        definition: form.definition,
      },
      submission: {
        id: submission.id,
        currentRole: magicLink.roleName,
        data: submission.data,
        submitterEmail: submission.submitterEmail,
      },
      newAnswers: validatedAnswers,
    });

    return {
      submissionId: submission.id,
      completed: advanceResult.completed,
      nextRole: advanceResult.nextRole,
      message: advanceResult.completed
        ? 'Form processing complete. Thank you!'
        : `Section completed. Forwarded to ${advanceResult.nextRole}.`,
    };
  }

  /**
   * Lists submissions for a form (Keyset paginated).
   */
  async listSubmissions(
    organizationId: string,
    formId: string,
    options: ListSubmissionsOptions = {},
  ) {
    const form = await this.formsRepo.findFormById(organizationId, formId);
    if (!form) {
      throw new NotFoundException({
        code: 'FORM_NOT_FOUND',
        message: `Form '${formId}' not found.`,
      });
    }
    return this.formsRepo.listSubmissions(organizationId, formId, options);
  }

  /**
   * Retrieves single submission detail.
   */
  async getSubmission(organizationId: string, formId: string, submissionId: string) {
    const submission = await this.formsRepo.findSubmissionById(
      organizationId,
      formId,
      submissionId,
    );
    if (!submission) {
      throw new NotFoundException({
        code: 'SUBMISSION_NOT_FOUND',
        message: `Submission '${submissionId}' not found.`,
      });
    }
    return submission;
  }

  /**
   * Exports submissions to RFC-4180 CSV with OWASP Formula Injection Protection (EC-FORM-14).
   * Any cell beginning with '=', '+', '-', '@', '\t', or '\r' is prefixed with single-quote.
   */
  async exportSubmissionsCsv(organizationId: string, formId: string): Promise<string> {
    const form = await this.formsRepo.findFormById(organizationId, formId);
    if (!form) {
      throw new NotFoundException({
        code: 'FORM_NOT_FOUND',
        message: `Form '${formId}' not found.`,
      });
    }

    const { items: submissions } = await this.formsRepo.listSubmissions(organizationId, formId, {
      limit: 1000,
    });

    // Extract all field IDs and labels
    const fieldMap = new Map<string, string>();
    const definition = (form.definition || {}) as unknown as FormDefinition;
    if (definition?.sections) {
      for (const section of definition.sections) {
        if (section.fields) {
          for (const field of section.fields) {
            fieldMap.set(field.id, field.label);
          }
        }
      }
    }

    const fieldIds = Array.from(fieldMap.keys());
    const headerCols = [
      'Submission ID',
      'Status',
      'Submitter Email',
      'Submitter IP',
      'Submitted At',
      ...fieldIds.map((id) => fieldMap.get(id) || id),
    ];

    const sanitizeCell = (val: unknown): string => {
      if (val === null || val === undefined) return '""';
      let str = typeof val === 'object' ? JSON.stringify(val) : String(val);

      // OWASP CSV Formula Injection defense:
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }

      // Escape internal double quotes per RFC-4180
      const escaped = str.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const rows: string[] = [];
    rows.push(headerCols.map(sanitizeCell).join(','));

    for (const sub of submissions) {
      const data = (sub.data || {}) as Record<string, unknown>;
      const row = [
        sub.id,
        sub.status,
        sub.submitterEmail || '',
        sub.submitterIp || '',
        sub.submittedAt ? sub.submittedAt.toISOString() : '',
        ...fieldIds.map((id) => (data[id] !== undefined ? data[id] : '')),
      ];
      rows.push(row.map(sanitizeCell).join(','));
    }

    return rows.join('\r\n');
  }
}
