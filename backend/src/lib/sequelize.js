import { Sequelize } from 'sequelize';

let sequelizeInstance = null;

// No crear la instancia hasta que se llame explícitamente
export const initSequelize = () => {
  if (!sequelizeInstance) {
    sequelizeInstance = new Sequelize(
      process.env.DB_NAME || 'tep',
      process.env.DB_USER || 'root',
      process.env.DB_PASSWORD || '',
      {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 3306),
        dialect: 'mysql',
        logging: false,
        define: { underscored: true, freezeTableName: true }
      }
    );
  }
  return sequelizeInstance;
};

export const getSequelize = () => sequelizeInstance;

export const sequelize = new Proxy({}, {
  get(target, prop) {
    if (!sequelizeInstance) {
      throw new Error('Sequelize not initialized. Call initSequelize() first.');
    }
    return sequelizeInstance[prop];
  }
});
