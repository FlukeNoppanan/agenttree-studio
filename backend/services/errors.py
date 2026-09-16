"""Safe service-layer failures suitable for API translation."""


class ServiceError(Exception):
    status_code = 400


class ResourceNotFoundError(ServiceError):
    status_code = 404


class ResourceConflictError(ServiceError):
    status_code = 409


class ServiceConfigurationError(ServiceError):
    status_code = 503


class ProviderOperationError(ServiceError):
    status_code = 502


class RunRequestError(ServiceError):
    """A safe, machine-readable runtime or input failure."""

    status_code = 422

    def __init__(self, error_code: str, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.error_code = error_code
        if status_code is not None:
            self.status_code = status_code
