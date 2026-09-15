import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SendMessageDto } from './chat-response.dto';
import { PostMomentDto } from './post-moment.dto';

describe('DTO Validation Security (SEC-06 & SEC-07)', () => {
  describe('SendMessageDto (SEC-06)', () => {
    it('should pass with a normal message body', async () => {
      const dto = plainToInstance(SendMessageDto, {
        body: 'Hello, this is a normal message!',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject message body exceeding 1000 characters', async () => {
      const longBody = 'A'.repeat(1001);
      const dto = plainToInstance(SendMessageDto, {
        body: longBody,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints?.maxLength).toContain('Message body cannot exceed 1000 characters');
    });

    it('should reject empty message body', async () => {
      const dto = plainToInstance(SendMessageDto, {
        body: '',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('PostMomentDto (SEC-07)', () => {
    it('should accept valid array of recipient strings', async () => {
      const dto = plainToInstance(PostMomentDto, {
        caption: 'Nice day!',
        recipients: ['friend-uid-1', 'friend-uid-2'],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.recipients).toEqual(['friend-uid-1', 'friend-uid-2']);
    });

    it('should transform JSON string format into string array', async () => {
      const dto = plainToInstance(PostMomentDto, {
        caption: 'Nice day!',
        recipients: JSON.stringify(['friend-uid-1', 'friend-uid-2']),
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.recipients).toEqual(['friend-uid-1', 'friend-uid-2']);
    });

    it('should reject array containing non-string elements (injection attempt)', async () => {
      const dto = plainToInstance(PostMomentDto, {
        caption: 'Injection test',
        recipients: [{ malicious: true }, 12345],
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints?.isString).toBeDefined();
    });

    it('should reject caption exceeding 150 characters', async () => {
      const dto = plainToInstance(PostMomentDto, {
        caption: 'C'.repeat(151),
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
