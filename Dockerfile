FROM node:15.14.0-alpine3.10

# Env
ENV TIME_ZONE=America/New_York
ENV ENV_NAME production
ENV NODE_ENV production

# Set the timezone in docker
# RUN apk --update add tzdata \\
#     && cp /usr/share/zoneinfo/America/New_York /etc/localtime \\
#     && echo "America/New_York" > /etc/timezone \\
#     && apk del tzdata

# Create Directory for the Container
WORKDIR /usr/src/app
# Only copy the package.json file to work directory
COPY package.json .
# Install all Packages
RUN npm install
# Install typescript
# Copy all other source code to work directory
ADD . /usr/src/app
# TypeScript
RUN ls
RUN ./node_modules/typescript/bin/tsc
# Start
CMD [ "npm", "run", "prod" ]
# EXPOSE 7001
