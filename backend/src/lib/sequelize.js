import { Sequelize } from 'sequelize';

let sequelizeInstance = null;

export const getSequelize = () => {
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

// Export for backward compatibility
export const sequelize = new Proxy({}, {
  get(target, prop) {
    return getSequelize()[prop];
  }
});
