import { AddDealRoomDocumentDto, AddDealRoomDocumentDtoSchema } from '@pactintel/shared-types';

export class AddDealRoomDocumentDtoClass implements AddDealRoomDocumentDto {
  documentId!: string;

  static validate(data: unknown): AddDealRoomDocumentDto {
    return AddDealRoomDocumentDtoSchema.parse(data);
  }
}
