import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class PostMomentDto {
  @IsOptional()
  @IsString()
  @MaxLength(150, {
    message: 'Caption cannot exceed 150 characters.',
  })
  caption?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          // fallback to comma separated
        }
      }
      return trimmed
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return value;
  })
  @IsArray({ message: 'Recipients must be an array of friend user IDs.' })
  @IsString({ each: true, message: 'Each recipient ID must be a string.' })
  @ArrayMaxSize(100, { message: 'Cannot specify more than 100 recipients.' })
  recipients?: string[];
}

