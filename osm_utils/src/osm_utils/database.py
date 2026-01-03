"""Database connection and ORM models for OSM utilities."""

import os
from pathlib import Path
from sqlalchemy import create_engine, Column, String, Numeric, DateTime, func, Index, text, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.dialects.postgresql import TEXT
from dotenv import load_dotenv

# Load environment variables from project root (.env file)
# This file is in osm_utils/src/osm_utils/, so go up 3 levels to reach project root
_project_root = Path(__file__).parent.parent.parent.parent
_env_file = _project_root / '.env'
load_dotenv(_env_file)

Base = declarative_base()


class Region(Base):
    """Region model for NUTS regions."""
    __tablename__ = 'region'
    
    code = Column(String, primary_key=True)  # NUTS region code (e.g., "ITH3", "NL36")
    country_code = Column(String(2), nullable=False)  # Country code (e.g., "IT", "NL")
    name_latn = Column(String, nullable=False)  # Latin name of the region
    
    def __repr__(self):
        return f"<Region(code='{self.code}', country_code='{self.country_code}', name_latn='{self.name_latn}')>"


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
    region = Column(String, ForeignKey('region.code', ondelete='RESTRICT'), nullable=False)
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
    """Remove all rows from the addresses table.
    
    Note: Uses CASCADE to handle foreign key constraints from dependent tables
    (e.g., active_job). This will also truncate those dependent tables.
    """
    engine = create_db_engine()
    
    # Check count before truncate
    with engine.connect() as conn:
        result = conn.execute(text("SELECT COUNT(*) FROM address"))
        count_before = int(result.scalar() or 0)
    
    # Truncate the table with CASCADE to handle foreign key constraints
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE address CASCADE"))
    
    # Verify truncate worked
    with engine.connect() as conn:
        result = conn.execute(text("SELECT COUNT(*) FROM address"))
        count_after = int(result.scalar() or 0)
    
    if count_before > 0:
        print(f"Truncated addresses table (removed {count_before:,} addresses)")
    else:
        print("Truncated addresses table (table was already empty)")
    
    if count_after != 0:
        raise RuntimeError(f"TRUNCATE failed - table still has {count_after:,} rows!")


def create_spatial_index():
    """Create spatial index on geometry column using PostGIS."""
    engine = create_db_engine()
    with engine.begin() as conn:
        # Create GIST index for spatial queries if it doesn't exist
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS addresses_location_gist_idx 
            ON address USING GIST (ST_GeomFromText(location))
        """))
    print("Created spatial index on location column") 