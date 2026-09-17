"""SQLAlchemy implementations kept behind repository contracts."""

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.models.destination import ResultDelivery, ResultDestination
from backend.models.provider import ProviderConnection
from backend.models.run import Run
from backend.models.tool import ToolConnection
from backend.models.tree import AgentConfig, Tree, TreeVersion


class SQLAlchemyTreeRepository:
    def __init__(self, database: Session) -> None:
        self.database = database

    @staticmethod
    def options():
        version = selectinload(Tree.current_version)
        return (
            version.selectinload(TreeVersion.agents).selectinload(AgentConfig.provider_connection),
            version.selectinload(TreeVersion.trigger),
            version.selectinload(TreeVersion.output),
            version.selectinload(TreeVersion.tool_assignments),
            selectinload(Tree.destinations),
        )

    def get(self, tree_id: str) -> Tree | None:
        return self.database.scalar(select(Tree).options(*self.options()).where(Tree.id == tree_id))

    def list(self) -> list[Tree]:
        return list(self.database.scalars(
            select(Tree).options(*self.options()).order_by(Tree.updated_at.desc()),
        ).all())

    def add(self, tree: Tree) -> None:
        self.database.add(tree)


class SQLAlchemyRunRepository:
    def __init__(self, database: Session) -> None:
        self.database = database

    @staticmethod
    def options():
        return (
            selectinload(Run.tree), selectinload(Run.tree_version),
            selectinload(Run.trace_events), selectinload(Run.delivery_results),
        )

    def get(self, run_id: str) -> Run | None:
        return self.database.scalar(select(Run).options(*self.options()).where(Run.id == run_id))

    def list(self, *, status: str | None = None, tree_id: str | None = None) -> list[Run]:
        statement = select(Run).options(*self.options()).order_by(Run.created_at.desc())
        if status:
            statement = statement.where(Run.status == status)
        if tree_id:
            statement = statement.where(Run.tree_id == tree_id)
        return list(self.database.scalars(statement).all())

    def add(self, run: Run) -> None:
        self.database.add(run)


class SQLAlchemyDestinationRepository:
    def __init__(self, database: Session) -> None:
        self.database = database

    def get(self, destination_id: str) -> ResultDestination | None:
        return self.database.get(ResultDestination, destination_id)

    def list_for_tree(self, tree_id: str, *, enabled_only: bool = False) -> list[ResultDestination]:
        statement = select(ResultDestination).where(ResultDestination.tree_id == tree_id)
        if enabled_only:
            statement = statement.where(ResultDestination.enabled.is_(True))
        return list(self.database.scalars(statement.order_by(ResultDestination.created_at)).all())

    def add(self, destination: ResultDestination) -> None:
        self.database.add(destination)

    def add_delivery(self, delivery: ResultDelivery) -> None:
        self.database.add(delivery)


class SQLAlchemyDashboardRepository:
    """Read model for the dashboard, isolated from route and presentation code."""

    def __init__(self, database: Session) -> None:
        self.database = database

    def list_trees(self) -> list[Tree]:
        return SQLAlchemyTreeRepository(self.database).list()

    def list_runs(self) -> list[Run]:
        return SQLAlchemyRunRepository(self.database).list()

    def list_providers(self) -> list[ProviderConnection]:
        return list(self.database.scalars(
            select(ProviderConnection)
            .options(selectinload(ProviderConnection.models))
            .order_by(ProviderConnection.updated_at.desc()),
        ).all())

    def list_tools(self) -> list[ToolConnection]:
        return list(self.database.scalars(
            select(ToolConnection).order_by(ToolConnection.updated_at.desc()),
        ).all())
