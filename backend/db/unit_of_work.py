"""Lightweight transaction boundary for future alternate persistence backends."""

from sqlalchemy.orm import Session

from backend.repositories.sqlalchemy import (
    SQLAlchemyDestinationRepository,
    SQLAlchemyDashboardRepository,
    SQLAlchemyRunRepository,
    SQLAlchemyTreeRepository,
)


class SqlAlchemyUnitOfWork:
    def __init__(self, database: Session) -> None:
        self.database = database
        self.trees = SQLAlchemyTreeRepository(database)
        self.runs = SQLAlchemyRunRepository(database)
        self.destinations = SQLAlchemyDestinationRepository(database)
        self.dashboard = SQLAlchemyDashboardRepository(database)

    def __enter__(self) -> "SqlAlchemyUnitOfWork":
        return self

    def __exit__(self, exc_type, exc, traceback) -> None:
        if exc_type is not None:
            self.database.rollback()

    def commit(self) -> None:
        self.database.commit()
