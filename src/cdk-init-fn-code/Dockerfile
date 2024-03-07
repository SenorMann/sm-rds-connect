FROM amazon/aws-lambda-nodejs:20
WORKDIR ${LAMBDA_TASK_ROOT}

COPY package.json package-lock.json dist/index.js src/create-db-user.sql ./
RUN npm install --only=production

CMD ["index.handler"]
