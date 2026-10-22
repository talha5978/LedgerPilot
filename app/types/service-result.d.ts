export type ServiceResult<T> = {
	data: T | null;
	error: ApiError | null;
};
