import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import java.util.regex.Pattern
import java.util.UUID

/*
 * Sends a rocket chat notification
 */
def notifyRocketChat(text, url) {
    def rocketChatURL = url
    def message = text.replaceAll(~/\'/, "")
    def payload = JsonOutput.toJson([
      "username":"Jenkins",
      "icon_url":"https://wiki.jenkins.io/download/attachments/2916393/headshot.png",
      "text": message
    ])

    sh("curl -X POST -H 'Content-Type: application/json' --data \'${payload}\' ${rocketChatURL}")
}


/*
 * takes in a sonarqube status json payload
 * and returns the status string
 */
def sonarGetStatus (jsonPayload) {
  def jsonSlurper = new JsonSlurper()
  return jsonSlurper.parseText(jsonPayload).projectStatus.status
}

/*
 * Updates the global pastBuilds array: it will iterate recursively
 * and add all the builds prior to the current one that had a result
 * different than 'SUCCESS'.
 */
def buildsSinceLastSuccess(previousBuild, build) {
  if ((build != null) && (build.result != 'SUCCESS')) {
    pastBuilds.add(build)
    buildsSinceLastSuccess(pastBuilds, build.getPreviousBuild())
  }
}

/*
 * Generates a string containing all the commit messages from
 * the builds in pastBuilds.
 */
@NonCPS
def getChangeLog(pastBuilds) {
  def log = ""
  for (int x = 0; x < pastBuilds.size(); x++) {
    for (int i = 0; i < pastBuilds[x].changeSets.size(); i++) {
      def entries = pastBuilds[x].changeSets[i].items
      for (int j = 0; j < entries.length; j++) {
        def entry = entries[j]
        log += "* ${entry.msg} by ${entry.author} \n"
      }
    }
  }
  return log;
}

/*
 * Using fake credentials for the environment variables.
 * They just need to be there as placeholders for some of the unit tests.
 */
def nodejsTester () {
  openshift.withCluster() {
    openshift.withProject() {
      String testPodLabel = "node-tester-${UUID.randomUUID().toString()}";
      println testPodLabel;
      podTemplate(
        label: testPodLabel,
        name: testPodLabel,
        serviceAccount: 'jenkins',
        cloud: 'openshift',
        slaveConnectTimeout: 300,
        containers: [
          containerTemplate(
            name: 'jnlp',
            image: 'registry.access.redhat.com/openshift3/jenkins-agent-nodejs-8-rhel7',
            resourceRequestCpu: '500m',
            resourceLimitCpu: '1000m',
            resourceRequestMemory: '2Gi',
            resourceLimitMemory: '4Gi',
            workingDir: '/tmp',
            command: '',
            envVars: [
                envVar(key: 'MONGODB_DATABASE', value: 'epic'), 
                envVar(key: 'MINIO_ACCESS_KEY', value: 'xxxx'),
                envVar(key: 'MINIO_SECRET_KEY', value: 'xxxx'),
                envVar(key: 'MINIO_HOST', value: 'foo.pathfinder.gov.bc.ca'),
                envVar(key: 'KEYCLOAK_ENABLED', value: 'true'),
                envVar(key: 'GENERATE_ON', value: 'true'),
                envVar(key: 'GENERATE_NUM_OF_PROJECTS', value: '10'),
                envVar(key: 'GENERATE_SAVE_TO_PERSISTENT_MONGO', value: 'false'),
                envVar(key: 'GENERATE_CONSISTENT_DATA', value: 'true'),
                envVar(key: 'GENERATE_FILES', value: 'false'),
                envVar(key: 'PERSIST_FILES', value: 'false')
            ]
          )
        ]
      ) {
        node(testPodLabel) {
          checkout scm
          sh 'npm i'
          try {
            sh 'npm run tests'
          } finally {
            echo "Unit Tests Passed"
          }
        }
      }
      return true
    }
  }
}

def nodejsSonarqube () {
  openshift.withCluster() {
    openshift.withProject() {
      String sonarLabel = "sonarqube-runner-${UUID.randomUUID().toString()}";
      println sonarLabel;
      podTemplate(
        label: "${sonarLabel}",
        name: "${sonarLabel}",
        serviceAccount: 'jenkins',
        cloud: 'openshift',
        slaveConnectTimeout: 300,
        containers: [
          containerTemplate(
            name: 'jnlp',
            image: 'registry.access.redhat.com/openshift3/jenkins-agent-nodejs-8-rhel7:v3.11.161',
            resourceRequestCpu: '500m',
            resourceLimitCpu: '1000m',
            resourceRequestMemory: '2Gi',
            resourceLimitMemory: '4Gi',
            workingDir: '/tmp',
            command: '',
            args: '${computer.jnlpmac} ${computer.name}',
          )
        ]
      ) {
        node("${sonarLabel}") {
          checkout scm
          dir('sonar-runner') {
            try {
              // run scan
              sh("oc extract secret/sonarqube-secrets --to=${env.WORKSPACE}/sonar-runner --confirm")
              SONARQUBE_URL = sh(returnStdout: true, script: 'cat sonarqube-route-url')

              sh "npm install typescript"
              sh returnStdout: true, script: "./gradlew sonarqube -Dsonar.host.url=${SONARQUBE_URL} -Dsonar. -Dsonar.verbose=true --stacktrace --info"

              // wiat for scan status to update
              sleep(30)

              // check if sonarqube passed
              sh("oc extract secret/sonarqube-status-urls --to=${env.WORKSPACE}/sonar-runner --confirm")
              SONARQUBE_STATUS_URL = sh(returnStdout: true, script: 'cat sonarqube-status-api')

              SONARQUBE_STATUS_JSON = sh(returnStdout: true, script: "curl -w '%{http_code}' '${SONARQUBE_STATUS_URL}'")
              SONARQUBE_STATUS = sonarGetStatus (SONARQUBE_STATUS_JSON)

              if ( "${SONARQUBE_STATUS}" == "ERROR") {
                echo "Scan Failed"

                notifyRocketChat(
                  "@all The latest build ${env.BUILD_DISPLAY_NAME} of eagle-api seems to be broken. \n ${env.RUN_DISPLAY_URL}\n Error: \n Sonarqube scan failed",
                  ROCKET_DEPLOY_WEBHOOK
                )

                currentBuild.result = 'FAILURE'
                exit 1
              } else {
                echo "Scan Passed"
              }

            } catch (error) {
              notifyRocketChat(
                "@all The latest build ${env.BUILD_DISPLAY_NAME} of eagle-api seems to be broken. \n ${env.RUN_DISPLAY_URL}\n Error: \n ${error}",
                ROCKET_DEPLOY_WEBHOOK
              )
              throw error
            } finally {
              echo "Scan Complete"
            }
          }
        }
      }
      return true
    }
  }
}

def CHANGELOG = "No new changes"
def IMAGE_HASH = "latest"

pipeline {
  agent any
  options {
    disableResume()
  }
  stages {
    stage('Parallel Build Steps') {
      failFast true
      parallel {
        stage('Build') {
          agent any
          steps {
            script {
              pastBuilds = []
              buildsSinceLastSuccess(pastBuilds, currentBuild);
              CHANGELOG = getChangeLog(pastBuilds);

              echo ">>>>>>Changelog: \n ${CHANGELOG}"

              try {
                sh("oc extract secret/rocket-chat-secrets --to=${env.WORKSPACE} --confirm")
                ROCKET_DEPLOY_WEBHOOK = sh(returnStdout: true, script: 'cat rocket-deploy-webhook')
                ROCKET_QA_WEBHOOK = sh(returnStdout: true, script: 'cat rocket-qa-webhook')

                echo "Building eagle-api develop branch"
                openshiftBuild bldCfg: 'eagle-api', showBuildLogs: 'true'
                echo "Build done"

                echo ">>> Get Image Hash"
                // Don't tag with BUILD_ID so the pruner can do it's job; it won't delete tagged images.
                // Tag the images for deployment based on the image's hash
                IMAGE_HASH = sh (
                  script: """oc get istag eagle-api:latest -o template --template=\"{{.image.dockerImageReference}}\"|awk -F \":\" \'{print \$3}\'""",
                  returnStdout: true).trim()
                echo ">> IMAGE_HASH: ${IMAGE_HASH}"
              } catch (error) {
                notifyRocketChat(
                  "@all The build ${env.BUILD_DISPLAY_NAME} of eagle-api, seems to be broken.\n ${env.RUN_DISPLAY_URL}\n Error: \n ${error.message}",
                  ROCKET_DEPLOY_WEBHOOK
                )
                throw error
              }
            }
          }
        }

        stage('Unit Tests') {
          steps {
            script {
              echo "Running Unit Tests"
              def result = nodejsTester()
            }
          }
        }

        stage('Sonarqube') {
          steps {
            script {
              echo "Running Sonarqube"
              def result = nodejsSonarqube()
            }
          }
        }
      }
    }

    stage('Deploy to dev'){
      steps {
        script {
          try {
            echo "Deploying to dev..."
            openshiftTag destStream: 'eagle-api', verbose: 'false', destTag: 'dev', srcStream: 'eagle-api', srcTag: "${IMAGE_HASH}"
            sleep 5

            openshiftVerifyDeployment depCfg: 'eagle-api', namespace: 'esm-dev', replicaCount: 1, verbose: 'false', verifyReplicaCount: 'false', waitTime: 600000
            echo ">>>> Deployment Complete"

            notifyRocketChat(
              "A new version of eagle-api is now in Dev, build: ${env.BUILD_DISPLAY_NAME} \n Changes: \n ${CHANGELOG}",
              ROCKET_DEPLOY_WEBHOOK
            )

            notifyRocketChat(
              "@all A new version of eagle-api is now in Dev and ready for QA. \n Changes to Dev: \n ${CHANGELOG}",
              ROCKET_QA_WEBHOOK
            )
          } catch (error) {
            notifyRocketChat(
              "@all The build ${env.BUILD_DISPLAY_NAME} of eagle-api, seems to be broken.\n ${env.RUN_DISPLAY_URL}\n Error: \n ${error.message}",
              ROCKET_DEPLOY_WEBHOOK
            )
            currentBuild.result = "FAILURE"
            throw new Exception("Deploy failed")
          }
        }
      }
    }
  }
}