"""Database connection and ORM models for OSM utilities."""

import os
from sqlalchemy import create_engine, Column, String, Numeric, DateTime, func, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.dialects.postgresql import TEXT
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

Base = declarative_base()


class Address(Base):
    """Address model with PostGIS geometry support."""
    __tablename__ = 'address'
    
    id = Column(String, primary_key=True)
    street = Column(String)
    house_number = Column(String)
    postcode = Column(String)
    city = Column(String)
    # PostGIS geometry column stored as text - actual geometry handling in SQL
    location = Column(TEXT, nullable=False)
    lat = Column(Numeric, nullable=False)
    lon = Column(Numeric, nullable=False)
    created_at = Column(DateTime, default=func.current_timestamp())
    
    # Define indexes
    __table_args__ = (
        Index('addresses_location_idx', 'location'),
        Index('addresses_city_idx', 'city'),
        Index('addresses_postcode_idx', 'postcode'),
    )
    
    def __repr__(self):
        return f"<Address(id='{self.id}', street='{self.street}', city='{self.city}')>"


def get_database_url():
    """Get database URL from environment variables."""
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        # Default to local PostgreSQL with docker-compose settings
        database_url = "postgresql://routing_user:routing_password@localhost:5432/routing_game"
    return database_url


def create_db_engine():
    """Create SQLAlchemy engine."""
    database_url = get_database_url()
    engine = create_engine(database_url, echo=False)
    return engine


def create_db_session(engine=None):
    """Create database session."""
    if engine is None:
        engine = create_db_engine()
    
    Session = sessionmaker(bind=engine)
    return Session()


def init_database():
    """Initialize database tables."""
    engine = create_db_engine()
    Base.metadata.create_all(engine)
    return engine


def truncate_addresses_table():
    """Remove all rows from the addresses table."""
    engine = create_db_engine()
    with engine.connect() as conn:
        conn.execute(func.text("TRUNCATE TABLE address"))
        conn.commit()
    print("Truncated addresses table")


def create_spatial_index():
    """Create spatial index on geometry column using PostGIS."""
    engine = create_db_engine()
    with engine.connect() as conn:
        # Create GIST index for spatial queries if it doesn't exist
        conn.execute(func.text("""
            CREATE INDEX IF NOT EXISTS addresses_location_gist_idx 
            ON address USING GIST (ST_GeomFromText(location))
        """))
        conn.commit()
    print("Created spatial index on location column") 