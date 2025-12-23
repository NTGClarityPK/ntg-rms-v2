import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNumber, IsString, IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

class RecipeIngredientDto {
  @ApiProperty()
  @IsUUID()
  ingredientId: string;

  @ApiProperty()
  @IsNumber()
  quantity: number;

  @ApiProperty()
  @IsString()
  unit: string;
}

export class CreateRecipeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  foodItemId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  addOnId?: string;

  @ApiProperty({ type: [RecipeIngredientDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientDto)
  ingredients: RecipeIngredientDto[];
}

