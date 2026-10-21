import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from "class-validator"

export class DashboardDto {
    @IsString()
    @IsNotEmpty()
    startDate: string
    @IsString()
    @IsNotEmpty()
    endDate: string
    @IsString()
    @IsOptional()
    employeeId: string
    /**
     * Nombrada seleccionada. El valor es el `staff_vessel_number` que publica
     * `GET /entry/dashboard/filters`; es la clave que entienden todos los
     * cálculos del panel.
     */
    @IsString()
    @IsOptional()
    namedId: string
    @IsString()
    @IsOptional()
    position: string
    @IsString()
    @IsOptional()
    ship: string
    @IsString()
    @IsOptional()
    turn: string
    // Sin valor por defecto, `(page - 1) * limit` daba `NaN` y `slice(NaN, NaN)`
    // devolvía la lista entera: una consulta amplia respondía con todo el rango.
    @IsInt()
    @IsOptional()
    @Min(1)
    @Max(100000)
    limit: number = 10
    @IsInt()
    @IsOptional()
    @Min(1)
    page: number = 1
    @IsString()
    @IsOptional()
    orderBy: string
    @IsString()
    @IsOptional()
    @IsIn(['asc', 'desc'])
    orderDirection: string
}
